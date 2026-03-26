import { generateEmbedding, translateQueryToEnglish } from './gemini';
import { db } from './db';
import { embeddings } from './schema';
import { sql } from 'drizzle-orm';

export interface SearchResult {
  id: string;
  fileName: string;
  fileType: string;
  filePath: string;
  chunkText: string | null;
  contentSummary: string | null;
  similarity: number;
  metadata: Record<string, unknown> | null;
}

const MIN_SIMILARITY = 0.3;

// Extract filename patterns from query (e.g., "vigenair.mp4", "report.pdf")
function extractFileNames(query: string): string[] {
  const matches = query.match(/[\w\-_.]+\.\w{2,5}/g);
  return matches ?? [];
}

async function vectorSearch(vectorStr: string, topK: number): Promise<SearchResult[]> {
  return await db.execute(sql`
    SELECT
      id,
      file_name AS "fileName",
      file_type AS "fileType",
      file_path AS "filePath",
      chunk_text AS "chunkText",
      content_summary AS "contentSummary",
      1 - (embedding <=> ${vectorStr}::vector) AS similarity,
      metadata
    FROM embeddings
    WHERE 1 - (embedding <=> ${vectorStr}::vector) >= ${MIN_SIMILARITY}
    ORDER BY embedding <=> ${vectorStr}::vector
    LIMIT ${topK}
  `) as unknown as SearchResult[];
}

function mergeResults(resultSets: SearchResult[][], topK: number): SearchResult[] {
  const seenIds = new Set<string>();
  const merged: SearchResult[] = [];

  for (const results of resultSets) {
    for (const r of results) {
      if (!seenIds.has(r.id)) {
        seenIds.add(r.id);
        merged.push(r);
      } else {
        // Keep the higher similarity score
        const existing = merged.find((m) => m.id === r.id);
        if (existing && r.similarity > existing.similarity) {
          existing.similarity = r.similarity;
        }
      }
    }
  }

  return merged.sort((a, b) => b.similarity - a.similarity).slice(0, topK);
}

export async function searchSimilar(query: string, topK = 5): Promise<SearchResult[]> {
  // Original query vector
  const originalVector = await generateEmbedding(query, 'RETRIEVAL_QUERY');
  const originalVectorStr = `[${originalVector.join(',')}]`;

  // Translate to English (returns null if already English)
  const translatedQuery = await translateQueryToEnglish(query);

  // Run searches in parallel
  const searchPromises: Promise<SearchResult[]>[] = [
    vectorSearch(originalVectorStr, topK),
  ];

  if (translatedQuery) {
    searchPromises.push(
      generateEmbedding(translatedQuery, 'RETRIEVAL_QUERY').then((vec) =>
        vectorSearch(`[${vec.join(',')}]`, topK)
      )
    );
  }

  // Filename-based search
  const fileNames = extractFileNames(query);
  if (fileNames.length > 0) {
    const fileNameConditions = fileNames.map(
      (name) => sql`LOWER(file_name) = LOWER(${name})`
    );
    const combinedCondition = fileNameConditions.reduce(
      (acc, cond) => sql`${acc} OR ${cond}`
    );
    searchPromises.push(
      db.execute(sql`
        SELECT
          id,
          file_name AS "fileName",
          file_type AS "fileType",
          file_path AS "filePath",
          chunk_text AS "chunkText",
          content_summary AS "contentSummary",
          1 - (embedding <=> ${originalVectorStr}::vector) AS similarity,
          metadata
        FROM embeddings
        WHERE ${combinedCondition}
        ORDER BY embedding <=> ${originalVectorStr}::vector
        LIMIT ${topK}
      `).then((r) => r as unknown as SearchResult[])
    );
  }

  const allResults = await Promise.all(searchPromises);
  return mergeResults(allResults, topK);
}

export function buildRAGPrompt(query: string, results: SearchResult[]): string {
  if (results.length === 0) {
    return `You are a RAG assistant.
No relevant documents were found. Please inform the user: "No relevant documents found. Please embed related files first."

## User Question:
${query}`;
  }

  const context = results.map((r, i) => {
    const parts: string[] = [];
    if (r.chunkText) parts.push(r.chunkText);
    if (r.contentSummary) parts.push(`[Visual Description] ${r.contentSummary}`);
    const content = parts.join('\n\n') || '';
    const fileInfo = `[File: ${r.fileName}, Type: ${r.fileType}, Similarity: ${(r.similarity * 100).toFixed(1)}%]`;
    return `--- Search Result ${i + 1} ${fileInfo} ---\n${content}`;
  }).join('\n\n');

  return `You are a RAG assistant that answers questions based on retrieved documents.
If the search results contain image files, include the file description and filename in your response.
For information not found in the search results, respond with "The requested information was not found in the search results."

## Retrieved Documents:
${context}

## User Question:
${query}`;
}
