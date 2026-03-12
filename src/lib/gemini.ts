import { GoogleGenAI } from '@google/genai';
import { env } from './env';

export const genai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

export async function generateEmbedding(
  contents: string | Array<{ inlineData: { mimeType: string; data: string } }>,
  taskType?: string
): Promise<number[]> {
  const response = await genai.models.embedContent({
    model: 'gemini-embedding-2-preview',
    contents: Array.isArray(contents) ? contents : [contents],
    config: {
      outputDimensionality: 3072,
      ...(taskType && { taskType }),
    },
  });

  const embedding = response.embeddings?.[0]?.values;
  if (!embedding) {
    throw new Error('Embedding response did not contain values');
  }
  return embedding;
}

export async function generateContentSummary(
  fileData: string,
  mimeType: string
): Promise<string> {
  const response = await genai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: [
      { text: '이 파일의 내용을 상세하게 설명해주세요. 텍스트, 색상, 형태, 특징 등을 포함하세요.' },
      { inlineData: { mimeType, data: fileData } },
    ],
  });
  return response.text ?? '';
}
