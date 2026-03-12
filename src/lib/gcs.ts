import { Storage } from '@google-cloud/storage';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

function createStorage() {
  const keyFilePath = process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS)
    : undefined;

  if (keyFilePath && fs.existsSync(keyFilePath)) {
    const credentials = JSON.parse(fs.readFileSync(keyFilePath, 'utf-8'));
    return new Storage({
      projectId: process.env.GCS_PROJECT_ID,
      credentials,
    });
  }

  return new Storage({
    projectId: process.env.GCS_PROJECT_ID,
  });
}

const storage = createStorage();
const bucketName = process.env.GCS_BUCKET_NAME!;
const bucket = storage.bucket(bucketName);

export async function uploadToGCS(
  fileBuffer: Buffer,
  originalName: string,
  mimeType: string
): Promise<string> {
  const ext = path.extname(originalName);
  const gcsPath = `uploads/${uuidv4()}${ext}`;
  const file = bucket.file(gcsPath);

  await file.save(fileBuffer, {
    metadata: { contentType: mimeType },
  });

  // Return internal path (served via /api/files proxy)
  return `/api/files/${encodeURIComponent(gcsPath)}`;
}

export async function downloadFromGCS(gcsPath: string): Promise<{ buffer: Buffer; contentType: string }> {
  const file = bucket.file(gcsPath);
  const [buffer] = await file.download();
  const [metadata] = await file.getMetadata();
  return {
    buffer: Buffer.from(buffer),
    contentType: (metadata.contentType as string) ?? 'application/octet-stream',
  };
}
