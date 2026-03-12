import { NextRequest, NextResponse } from 'next/server';
import { embedFile } from '@/lib/embedding';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await embedFile(buffer, file.name);

  return NextResponse.json({
    success: true,
    fileName: result.fileName,
    chunksCreated: result.chunksCreated,
  });
}
