import { generateEmbedding, generateContentSummary } from './gemini';
import { uploadToGCS } from './gcs';
import { getFileCategory, getMimeType, extractTextFromPDF, chunkText } from './file-parser';
import { db } from './db';
import { embeddings } from './schema';

export interface EmbedResult {
  fileName: string;
  chunksCreated: number;
}

export async function embedFile(
  fileBuffer: Buffer,
  fileName: string
): Promise<EmbedResult> {
  const category = getFileCategory(fileName);
  const mimeType = getMimeType(fileName);

  // Upload to GCS
  const gcsUrl = await uploadToGCS(fileBuffer, fileName, mimeType);

  if (category === 'text' || category === 'pdf') {
    const text = category === 'pdf'
      ? await extractTextFromPDF(fileBuffer)
      : fileBuffer.toString('utf-8');

    const chunks = chunkText(text);

    for (let i = 0; i < chunks.length; i++) {
      const vector = await generateEmbedding(chunks[i], 'RETRIEVAL_DOCUMENT');
      await db.insert(embeddings).values({
        fileName,
        fileType: category,
        filePath: gcsUrl,
        chunkIndex: i,
        chunkText: chunks[i],
        embedding: vector,
        metadata: { totalChunks: chunks.length },
      });
    }

    return { fileName, chunksCreated: chunks.length };
  }

  // Multimodal: image, audio, video
  const base64 = fileBuffer.toString('base64');
  const vector = await generateEmbedding(
    [{ inlineData: { mimeType, data: base64 } }],
    'RETRIEVAL_DOCUMENT'
  );
  const summary = await generateContentSummary(base64, mimeType);

  await db.insert(embeddings).values({
    fileName,
    fileType: category,
    filePath: gcsUrl,
    chunkIndex: 0,
    contentSummary: summary,
    embedding: vector,
    metadata: { mimeType },
  });

  return { fileName, chunksCreated: 1 };
}
