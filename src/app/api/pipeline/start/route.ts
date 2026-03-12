import { NextRequest, NextResponse } from 'next/server';
import { embedFile } from '@/lib/embedding';
import { getFileCategory } from '@/lib/file-parser';
import { resetStatus, updateStatus, addLog, getStatus } from '@/lib/pipeline-state';
import fs from 'fs/promises';
import path from 'path';

export async function POST(req: NextRequest) {
  const { sourcePath } = await req.json();

  if (!sourcePath) {
    return NextResponse.json({ error: 'sourcePath required' }, { status: 400 });
  }

  processFiles(sourcePath).catch(console.error);

  return NextResponse.json({ started: true });
}

async function processFiles(sourcePath: string) {
  const files = await fs.readdir(sourcePath);
  const supportedFiles = files.filter((f) => {
    try {
      getFileCategory(f);
      return true;
    } catch {
      return false;
    }
  });

  resetStatus(supportedFiles.length);

  const concurrency = 5;
  for (let i = 0; i < supportedFiles.length; i += concurrency) {
    const batch = supportedFiles.slice(i, i + concurrency);
    await Promise.allSettled(
      batch.map(async (fileName) => {
        const filePath = path.join(sourcePath, fileName);
        updateStatus({ currentFile: fileName });
        const start = Date.now();

        let retries = 3;
        while (retries > 0) {
          try {
            const buffer = await fs.readFile(filePath);
            await embedFile(buffer, fileName);
            const duration = Date.now() - start;
            const current = getStatus();
            updateStatus({ completed: current.completed + 1, succeeded: current.succeeded + 1 });
            addLog({ fileName, status: 'success', duration });
            return;
          } catch (err) {
            retries--;
            if (retries === 0) {
              const duration = Date.now() - start;
              const current = getStatus();
              updateStatus({ completed: current.completed + 1, failed: current.failed + 1 });
              addLog({ fileName, status: 'error', message: String(err), duration });
            }
          }
        }
      })
    );
  }

  updateStatus({ running: false, currentFile: '' });
}
