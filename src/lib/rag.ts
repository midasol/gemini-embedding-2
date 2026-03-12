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
    return `당신은 RAG 어시스턴트입니다.
검색된 문서가 없습니다. 사용자의 질문에 대해 "관련 문서를 찾을 수 없습니다. 먼저 관련 파일을 임베딩해 주세요."라고 안내하세요.

## 사용자 질문:
${query}`;
  }

  const context = results.map((r, i) => {
    const parts: string[] = [];
    if (r.chunkText) parts.push(r.chunkText);
    if (r.contentSummary) parts.push(`[시각적 설명] ${r.contentSummary}`);
    const content = parts.join('\n\n') || '';
    const fileInfo = `[파일: ${r.fileName}, 유형: ${r.fileType}, 유사도: ${(r.similarity * 100).toFixed(1)}%]`;
    return `--- 검색결과 ${i + 1} ${fileInfo} ---\n${content}`;
  }).join('\n\n');

  return `당신은 검색된 문서를 기반으로 질문에 답하는 RAG 어시스턴트입니다.
검색 결과에 이미지 파일이 있다면, 해당 파일의 설명과 파일명을 함께 안내해주세요.
검색 결과에 없는 내용은 "검색 결과에서 해당 정보를 찾을 수 없습니다"라고 답하세요.

## 검색된 문서:
${context}

## 사용자 질문:
${query}`;
}
