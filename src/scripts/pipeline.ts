import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

import { embedFile } from '../lib/embedding';
import { getFileCategory } from '../lib/file-parser';

async function main() {
  const sourcePath = process.argv[2];
  if (!sourcePath) {
    console.error('Usage: npx tsx src/scripts/pipeline.ts <source-path>');
    process.exit(1);
  }

  const resolvedPath = path.resolve(sourcePath);
  console.log(`Scanning: ${resolvedPath}`);

  const files = await fs.readdir(resolvedPath);
  const supportedFiles = files.filter((f) => {
    try {
      getFileCategory(f);
      return true;
    } catch {
      return false;
    }
  });

  console.log(`Found ${supportedFiles.length} supported files`);

  let succeeded = 0;
  let failed = 0;
  const concurrency = 5;

  for (let i = 0; i < supportedFiles.length; i += concurrency) {
    const batch = supportedFiles.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map(async (fileName) => {
        const filePath = path.join(resolvedPath, fileName);
        const buffer = await fs.readFile(filePath);
        const result = await embedFile(buffer, fileName);
        console.log(`✅ ${fileName} (${result.chunksCreated} chunks)`);
        return result;
      })
    );

    for (const r of results) {
      if (r.status === 'fulfilled') succeeded++;
      else {
        failed++;
        console.error(`❌ ${r.reason}`);
      }
    }
  }

  console.log(`\nDone: ${succeeded} succeeded, ${failed} failed`);
}

main().catch(console.error);
