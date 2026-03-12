import { generateEmbedding } from './gemini';
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
}

export async function searchSimilar(query: string, topK = 5): Promise<SearchResult[]> {
  const queryVector = await generateEmbedding(query, 'RETRIEVAL_QUERY');
  const vectorStr = `[${queryVector.join(',')}]`;

  const results = await db.execute(sql`
    SELECT
      id,
      file_name AS "fileName",
      file_type AS "fileType",
      file_path AS "filePath",
      chunk_text AS "chunkText",
      content_summary AS "contentSummary",
      1 - (embedding <=> ${vectorStr}::vector) AS similarity
    FROM embeddings
    ORDER BY embedding <=> ${vectorStr}::vector
    LIMIT ${topK}
  `);

  return results.rows as SearchResult[];
}

export function buildRAGPrompt(query: string, results: SearchResult[]): string {
  const context = results.map((r, i) => {
    const content = r.chunkText || r.contentSummary || '';
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
