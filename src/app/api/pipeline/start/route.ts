import { NextRequest, NextResponse } from 'next/server';
import { embedFile } from '@/lib/embedding';
import { getFileCategory } from '@/lib/file-parser';
import { resetStatus, updateStatus, addLog, getStatus } from '@/lib/pipeline-state';
import fs from 'fs/promises';
import path from 'path';

// Allowed base directories for pipeline processing
const ALLOWED_BASE_DIRS = [
  path.resolve('./data'),
  path.resolve('./uploads'),
];

function isPathAllowed(sourcePath: string): boolean {
  const resolved = path.resolve(sourcePath);
  return ALLOWED_BASE_DIRS.some((base) => resolved.startsWith(base + path.sep) || resolved === base);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sourcePath } = body;

    if (!sourcePath || typeof sourcePath !== 'string') {
      return NextResponse.json({ error: 'sourcePath is required and must be a string' }, { status: 400 });
    }

    if (!isPathAllowed(sourcePath)) {
      return NextResponse.json(
        { error: `Access denied: sourcePath must be under ${ALLOWED_BASE_DIRS.join(' or ')}` },
        { status: 403 }
      );
    }

    const resolved = path.resolve(sourcePath);
    try {
      await fs.access(resolved);
    } catch {
      return NextResponse.json({ error: 'sourcePath does not exist' }, { status: 404 });
    }

    processFiles(resolved).catch((err) => {
      console.error('Pipeline failed:', err);
      updateStatus({ running: false, currentFile: '' });
    });

    return NextResponse.json({ started: true });
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
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
