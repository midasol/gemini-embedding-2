/* eslint-disable @typescript-eslint/no-explicit-any */
const TEXT_EXTENSIONS = ['.txt', '.md', '.csv', '.json', '.xml', '.html'];
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'];
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.flac', '.m4a'];
const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.avi', '.mov'];
const PDF_EXTENSIONS = ['.pdf'];

export type FileCategory = 'text' | 'pdf' | 'image' | 'audio' | 'video';

export function getFileCategory(fileName: string): FileCategory {
  const ext = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
  if (TEXT_EXTENSIONS.includes(ext)) return 'text';
  if (PDF_EXTENSIONS.includes(ext)) return 'pdf';
  if (IMAGE_EXTENSIONS.includes(ext)) return 'image';
  if (AUDIO_EXTENSIONS.includes(ext)) return 'audio';
  if (VIDEO_EXTENSIONS.includes(ext)) return 'video';
  throw new Error(`Unsupported file type: ${ext}`);
}

export function getMimeType(fileName: string): string {
  const ext = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
  const mimeMap: Record<string, string> = {
    '.txt': 'text/plain', '.md': 'text/markdown', '.csv': 'text/csv',
    '.json': 'application/json', '.xml': 'application/xml', '.html': 'text/html',
    '.pdf': 'application/pdf',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
    '.flac': 'audio/flac', '.m4a': 'audio/mp4',
    '.mp4': 'video/mp4', '.webm': 'video/webm', '.avi': 'video/x-msvideo', '.mov': 'video/quicktime',
  };
  return mimeMap[ext] ?? 'application/octet-stream';
}

export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import('pdf-parse') as any;
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  await parser.load();
  const result = await parser.getText();
  return String(result);
}

export function chunkText(text: string, maxChunkSize = 2000, overlap = 200): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + maxChunkSize, text.length);
    chunks.push(text.slice(start, end));
    start = end - overlap;
    if (start + overlap >= text.length) break;
  }
  return chunks;
}
