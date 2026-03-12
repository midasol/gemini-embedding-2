# Gemini RAG System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Gemini 모델 기반 멀티모달 RAG 시스템 구축 (채팅 UI + 배치 파이프라인 + 단일 파일 embedding)

**Architecture:** Next.js 15 App Router 단일 프로젝트. src/lib/에 공유 로직(Gemini client, DB, embedding), src/app/에 UI와 API Routes, src/scripts/에 CLI 파이프라인. PostgreSQL pgvector로 벡터 검색, GCS로 파일 저장.

**Tech Stack:** Next.js 15, TypeScript, @google/genai, Vercel AI SDK (@ai-sdk/google), Drizzle ORM, pgvector, @google-cloud/storage, Tailwind CSS, shadcn/ui, tsx

---

### Task 1: Next.js 프로젝트 초기화 및 의존성 설치

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `.env.local`, `.gitignore`

**Step 1: Next.js 프로젝트 생성**

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm
```

**Step 2: 핵심 의존성 설치**

```bash
pnpm add @google/genai @ai-sdk/google ai drizzle-orm postgres @google-cloud/storage pdf-parse uuid
pnpm add -D drizzle-kit @types/pdf-parse @types/uuid tsx
```

**Step 3: shadcn/ui 초기화**

```bash
pnpm dlx shadcn@latest init -d
pnpm dlx shadcn@latest add button input scroll-area separator card dialog progress badge
```

**Step 4: .env.local 생성**

```env
GEMINI_API_KEY=your-api-key
DATABASE_URL=postgresql://user:pass@host:5432/dbname
GCS_BUCKET_NAME=your-bucket-name
GCS_PROJECT_ID=your-project-id
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
```

**Step 5: .gitignore에 추가**

`.env.local`과 `service-account.json`이 포함되어 있는지 확인.

**Step 6: Commit**

```bash
git init
git add .
git commit -m "chore: initialize Next.js project with dependencies"
```

---

### Task 2: Drizzle ORM 스키마 및 DB 설정

**Files:**
- Create: `src/lib/db.ts`
- Create: `src/lib/schema.ts`
- Create: `drizzle.config.ts`

**Step 1: drizzle.config.ts 생성**

```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/lib/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

**Step 2: src/lib/schema.ts 생성**

```typescript
import { pgTable, uuid, varchar, text, integer, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { vector } from 'drizzle-orm/pg-core';

export const embeddings = pgTable(
  'embeddings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fileName: varchar('file_name', { length: 500 }).notNull(),
    fileType: varchar('file_type', { length: 50 }).notNull(),
    filePath: varchar('file_path', { length: 1000 }).notNull(),
    chunkIndex: integer('chunk_index').notNull().default(0),
    chunkText: text('chunk_text'),
    contentSummary: text('content_summary'),
    embedding: vector('embedding', { dimensions: 3072 }).notNull(),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [
    index('idx_embeddings_vector').using('ivfflat', table.embedding.op('vector_cosine_ops')),
    index('idx_embeddings_file_name').on(table.fileName),
  ]
);

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 200 }).notNull().default('새 대화'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }).notNull(),
    role: varchar('role', { length: 20 }).notNull(),
    content: text('content').notNull(),
    fileName: varchar('file_name', { length: 500 }),
    attachments: jsonb('attachments').default([]),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [
    index('idx_messages_conversation').on(table.conversationId, table.createdAt),
  ]
);
```

**Step 3: src/lib/db.ts 생성**

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client, { schema });
```

**Step 4: DB 마이그레이션 생성 및 적용**

```bash
npx drizzle-kit generate
npx drizzle-kit push
```

pgvector extension은 수동으로 실행:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

**Step 5: Commit**

```bash
git add src/lib/db.ts src/lib/schema.ts drizzle.config.ts drizzle/
git commit -m "feat: add Drizzle ORM schema with pgvector support"
```

---

### Task 3: Gemini 클라이언트 및 GCS 유틸리티

**Files:**
- Create: `src/lib/gemini.ts`
- Create: `src/lib/gcs.ts`

**Step 1: src/lib/gemini.ts 생성**

```typescript
import { GoogleGenAI } from '@google/genai';

export const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

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
  return response.embeddings![0].values!;
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
```

**Step 2: src/lib/gcs.ts 생성**

```typescript
import { Storage } from '@google-cloud/storage';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const storage = new Storage({
  projectId: process.env.GCS_PROJECT_ID,
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});

const bucket = storage.bucket(process.env.GCS_BUCKET_NAME!);

export async function uploadToGCS(
  fileBuffer: Buffer,
  originalName: string,
  mimeType: string
): Promise<string> {
  const ext = path.extname(originalName);
  const fileName = `uploads/${uuidv4()}${ext}`;
  const file = bucket.file(fileName);

  await file.save(fileBuffer, {
    metadata: { contentType: mimeType },
  });

  await file.makePublic();

  return `https://storage.googleapis.com/${process.env.GCS_BUCKET_NAME}/${fileName}`;
}
```

**Step 3: Commit**

```bash
git add src/lib/gemini.ts src/lib/gcs.ts
git commit -m "feat: add Gemini client and GCS upload utility"
```

---

### Task 4: 파일 파서 및 Embedding 로직

**Files:**
- Create: `src/lib/file-parser.ts`
- Create: `src/lib/embedding.ts`

**Step 1: src/lib/file-parser.ts 생성**

```typescript
import pdf from 'pdf-parse';

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
  const data = await pdf(buffer);
  return data.text;
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
```

**Step 2: src/lib/embedding.ts 생성**

```typescript
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
```

**Step 3: Commit**

```bash
git add src/lib/file-parser.ts src/lib/embedding.ts
git commit -m "feat: add file parser and embedding logic with multimodal support"
```

---

### Task 5: RAG 파이프라인

**Files:**
- Create: `src/lib/rag.ts`

**Step 1: src/lib/rag.ts 생성**

```typescript
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
```

**Step 2: Commit**

```bash
git add src/lib/rag.ts
git commit -m "feat: add RAG pipeline with vector similarity search"
```

---

### Task 6: 대화 API Routes

**Files:**
- Create: `src/app/api/conversations/route.ts`

**Step 1: src/app/api/conversations/route.ts 생성**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { conversations, messages } from '@/lib/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET() {
  const result = await db
    .select()
    .from(conversations)
    .orderBy(desc(conversations.updatedAt));

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const [conv] = await db
    .insert(conversations)
    .values({ title: body.title ?? '새 대화' })
    .returning();

  return NextResponse.json(conv);
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  await db.delete(conversations).where(eq(conversations.id, id));
  return NextResponse.json({ success: true });
}
```

**Step 2: Commit**

```bash
git add src/app/api/conversations/route.ts
git commit -m "feat: add conversations CRUD API route"
```

---

### Task 7: 채팅 API Route (RAG 스트리밍 응답)

**Files:**
- Create: `src/app/api/chat/route.ts`

**Step 1: src/app/api/chat/route.ts 생성**

```typescript
import { google } from '@ai-sdk/google';
import { streamText } from 'ai';
import { NextRequest } from 'next/server';
import { searchSimilar, buildRAGPrompt } from '@/lib/rag';
import { db } from '@/lib/db';
import { messages, conversations } from '@/lib/schema';
import { eq } from 'drizzle-orm';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { message, conversationId } = await req.json();

  // Search similar documents
  const searchResults = await searchSimilar(message, 5);

  // Build RAG prompt
  const ragPrompt = buildRAGPrompt(message, searchResults);

  // Get conversation history
  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt);

  const chatMessages = history.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  // Save user message
  await db.insert(messages).values({
    conversationId,
    role: 'user',
    content: message,
  });

  // Collect attachments from search results (images/videos)
  const attachments = searchResults
    .filter((r) => ['image', 'video'].includes(r.fileType))
    .map((r) => ({
      type: r.fileType,
      path: r.filePath,
      fileName: r.fileName,
      similarity: r.similarity,
    }));

  // Stream response
  const result = streamText({
    model: google('gemini-3.1-pro-preview'),
    messages: [
      ...chatMessages,
      { role: 'user', content: ragPrompt },
    ],
  });

  // Save assistant response after streaming completes
  const response = result.toDataStreamResponse();

  result.text.then(async (fullText) => {
    await db.insert(messages).values({
      conversationId,
      role: 'assistant',
      content: fullText,
      attachments,
    });

    // Update conversation title if first message
    if (history.length === 0) {
      const title = message.length > 30 ? message.substring(0, 30) + '...' : message;
      await db
        .update(conversations)
        .set({ title, updatedAt: new Date() })
        .where(eq(conversations.id, conversationId));
    }
  });

  return response;
}
```

**Step 2: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat: add chat API route with RAG streaming response"
```

---

### Task 8: 단일 파일 Embedding API Route

**Files:**
- Create: `src/app/api/embed/route.ts`

**Step 1: src/app/api/embed/route.ts 생성**

```typescript
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
```

**Step 2: Commit**

```bash
git add src/app/api/embed/route.ts
git commit -m "feat: add single file embedding API route"
```

---

### Task 9: 배치 파이프라인 API Routes + CLI 스크립트

**Files:**
- Create: `src/app/api/pipeline/start/route.ts`
- Create: `src/app/api/pipeline/status/route.ts`
- Create: `src/scripts/pipeline.ts`

**Step 1: 파이프라인 상태 관리를 위한 인메모리 스토어**

`src/lib/pipeline-state.ts` 생성:

```typescript
export interface PipelineStatus {
  running: boolean;
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
  currentFile: string;
  logs: Array<{ fileName: string; status: 'success' | 'error'; message?: string; duration: number }>;
}

let status: PipelineStatus = {
  running: false,
  total: 0,
  completed: 0,
  succeeded: 0,
  failed: 0,
  currentFile: '',
  logs: [],
};

export function getStatus(): PipelineStatus {
  return { ...status };
}

export function resetStatus(total: number) {
  status = { running: true, total, completed: 0, succeeded: 0, failed: 0, currentFile: '', logs: [] };
}

export function updateStatus(update: Partial<PipelineStatus>) {
  Object.assign(status, update);
}

export function addLog(log: PipelineStatus['logs'][0]) {
  status.logs.unshift(log);
  if (status.logs.length > 100) status.logs.pop();
}
```

**Step 2: src/app/api/pipeline/start/route.ts 생성**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { embedFile } from '@/lib/embedding';
import { getFileCategory } from '@/lib/file-parser';
import { resetStatus, updateStatus, addLog } from '@/lib/pipeline-state';
import fs from 'fs/promises';
import path from 'path';

export async function POST(req: NextRequest) {
  const { sourcePath } = await req.json();

  if (!sourcePath) {
    return NextResponse.json({ error: 'sourcePath required' }, { status: 400 });
  }

  // Start pipeline in background
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
            updateStatus({ completed: (await import('@/lib/pipeline-state')).getStatus().completed + 1, succeeded: (await import('@/lib/pipeline-state')).getStatus().succeeded + 1 });
            addLog({ fileName, status: 'success', duration });
            return;
          } catch (err) {
            retries--;
            if (retries === 0) {
              const duration = Date.now() - start;
              updateStatus({ completed: (await import('@/lib/pipeline-state')).getStatus().completed + 1, failed: (await import('@/lib/pipeline-state')).getStatus().failed + 1 });
              addLog({ fileName, status: 'error', message: String(err), duration });
            }
          }
        }
      })
    );
  }

  updateStatus({ running: false, currentFile: '' });
}
```

**Step 3: src/app/api/pipeline/status/route.ts 생성**

```typescript
import { NextResponse } from 'next/server';
import { getStatus } from '@/lib/pipeline-state';

export async function GET() {
  return NextResponse.json(getStatus());
}
```

**Step 4: src/scripts/pipeline.ts 생성**

```typescript
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
```

**Step 5: Commit**

```bash
git add src/app/api/pipeline/ src/scripts/pipeline.ts src/lib/pipeline-state.ts
git commit -m "feat: add batch embedding pipeline (API + CLI)"
```

---

### Task 10: 채팅 UI 컴포넌트 - ChatSidebar

**Files:**
- Create: `src/components/ChatSidebar.tsx`

**Step 1: src/components/ChatSidebar.tsx 생성**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Trash2, MessageSquare } from 'lucide-react';

interface Conversation {
  id: string;
  title: string;
  createdAt: string;
}

interface ChatSidebarProps {
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}

export function ChatSidebar({ activeId, onSelect, onNew }: ChatSidebarProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);

  useEffect(() => {
    fetch('/api/conversations')
      .then((r) => r.json())
      .then(setConversations);
  }, [activeId]);

  async function handleDelete(id: string) {
    await fetch(`/api/conversations?id=${id}`, { method: 'DELETE' });
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) onNew();
  }

  return (
    <div className="w-64 border-r bg-muted/30 flex flex-col h-full">
      <div className="p-4">
        <Button onClick={onNew} className="w-full" variant="outline">
          <Plus className="mr-2 h-4 w-4" /> 새 대화
        </Button>
      </div>
      <ScrollArea className="flex-1">
        {conversations.map((conv) => (
          <div
            key={conv.id}
            className={`flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-muted/50 ${
              activeId === conv.id ? 'bg-muted' : ''
            }`}
            onClick={() => onSelect(conv.id)}
          >
            <MessageSquare className="h-4 w-4 shrink-0" />
            <span className="truncate flex-1 text-sm">{conv.title}</span>
            <button
              onClick={(e) => { e.stopPropagation(); handleDelete(conv.id); }}
              className="opacity-0 group-hover:opacity-100 hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
      </ScrollArea>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/ChatSidebar.tsx
git commit -m "feat: add ChatSidebar component"
```

---

### Task 11: 채팅 UI 컴포넌트 - ChatWindow + ChatInput

**Files:**
- Create: `src/components/ChatWindow.tsx`
- Create: `src/components/ChatInput.tsx`

**Step 1: src/components/ChatWindow.tsx 생성**

```tsx
'use client';

import { ScrollArea } from '@/components/ui/scroll-area';
import { useEffect, useRef } from 'react';

interface Attachment {
  type: string;
  path: string;
  fileName: string;
  similarity: number;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments?: Attachment[];
}

interface ChatWindowProps {
  messages: Message[];
  streamingContent?: string;
}

export function ChatWindow({ messages, streamingContent }: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  return (
    <ScrollArea className="flex-1 p-4">
      <div className="max-w-3xl mx-auto space-y-6">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-lg p-4 ${
              msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
            }`}>
              <p className="whitespace-pre-wrap">{msg.content}</p>
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {msg.attachments
                    .filter((a) => a.type === 'image')
                    .map((a, i) => (
                      <div key={i} className="space-y-1">
                        <img
                          src={a.path}
                          alt={a.fileName}
                          className="rounded border w-full h-24 object-cover"
                        />
                        <p className="text-xs truncate">{a.fileName}</p>
                        <p className="text-xs text-muted-foreground">
                          {(a.similarity * 100).toFixed(0)}%
                        </p>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {streamingContent && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-lg p-4 bg-muted">
              <p className="whitespace-pre-wrap">{streamingContent}</p>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
```

**Step 2: src/components/ChatInput.tsx 생성**

```tsx
'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Paperclip, Send } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface ChatInputProps {
  onSend: (message: string, file?: File) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [input, setInput] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() && !file) return;
    onSend(input, file ?? undefined);
    setInput('');
    setFile(null);
  }

  return (
    <form onSubmit={handleSubmit} className="border-t p-4">
      {file && (
        <div className="mb-2 flex items-center gap-2">
          <Badge variant="secondary">{file.name}</Badge>
          <button type="button" onClick={() => setFile(null)} className="text-xs text-muted-foreground hover:text-destructive">
            삭제
          </button>
        </div>
      )}
      <div className="flex gap-2 max-w-3xl mx-auto">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="메시지를 입력하세요..."
          disabled={disabled}
          className="flex-1"
        />
        <Button type="submit" disabled={disabled || (!input.trim() && !file)}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </form>
  );
}
```

**Step 3: Commit**

```bash
git add src/components/ChatWindow.tsx src/components/ChatInput.tsx
git commit -m "feat: add ChatWindow and ChatInput components"
```

---

### Task 12: 채팅 페이지 통합

**Files:**
- Create: `src/app/chat/page.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/layout.tsx`

**Step 1: src/app/chat/page.tsx 생성**

```tsx
'use client';

import { useState, useCallback } from 'react';
import { ChatSidebar } from '@/components/ChatSidebar';
import { ChatWindow } from '@/components/ChatWindow';
import { ChatInput } from '@/components/ChatInput';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments?: Array<{ type: string; path: string; fileName: string; similarity: number }>;
}

export default function ChatPage() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState('');
  const [loading, setLoading] = useState(false);

  const loadMessages = useCallback(async (id: string) => {
    setConversationId(id);
    const res = await fetch(`/api/conversations?id=${id}`);
    // Messages will be loaded from conversation history
    setMessages([]);
  }, []);

  async function createConversation(): Promise<string> {
    const res = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const conv = await res.json();
    setConversationId(conv.id);
    setMessages([]);
    return conv.id;
  }

  async function handleSend(message: string, file?: File) {
    // Check if this is an embedding request
    if (file && message.includes('embedding')) {
      const formData = new FormData();
      formData.append('file', file);
      setLoading(true);
      const res = await fetch('/api/embed', { method: 'POST', body: formData });
      const result = await res.json();
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'user', content: `📎 ${file.name}\n${message}` },
        { id: crypto.randomUUID(), role: 'assistant', content: `파일 '${result.fileName}'이 성공적으로 임베딩되었습니다. (${result.chunksCreated}개 청크 생성)` },
      ]);
      setLoading(false);
      return;
    }

    let activeConvId = conversationId;
    if (!activeConvId) {
      activeConvId = await createConversation();
    }

    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'user', content: message }]);
    setLoading(true);
    setStreaming('');

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, conversationId: activeConvId }),
    });

    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    let fullText = '';

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        fullText += chunk;
        setStreaming(fullText);
      }
    }

    setStreaming('');
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: fullText }]);
    setLoading(false);
  }

  return (
    <div className="flex h-screen">
      <ChatSidebar
        activeId={conversationId}
        onSelect={loadMessages}
        onNew={() => { setConversationId(null); setMessages([]); }}
      />
      <div className="flex-1 flex flex-col">
        <header className="border-b px-6 py-3 font-semibold">
          Gemini RAG Chat
        </header>
        <ChatWindow messages={messages} streamingContent={streaming || undefined} />
        <ChatInput onSend={handleSend} disabled={loading} />
      </div>
    </div>
  );
}
```

**Step 2: src/app/page.tsx 수정 — 채팅으로 리다이렉트**

```tsx
import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/chat');
}
```

**Step 3: Commit**

```bash
git add src/app/chat/page.tsx src/app/page.tsx
git commit -m "feat: add chat page with sidebar, window, and input integration"
```

---

### Task 13: Admin 파이프라인 UI

**Files:**
- Create: `src/components/PipelineDashboard.tsx`
- Create: `src/app/admin/pipeline/page.tsx`

**Step 1: src/components/PipelineDashboard.tsx 생성**

```tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Play, Square } from 'lucide-react';

interface PipelineStatus {
  running: boolean;
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
  currentFile: string;
  logs: Array<{ fileName: string; status: 'success' | 'error'; message?: string; duration: number }>;
}

export function PipelineDashboard() {
  const [sourcePath, setSourcePath] = useState('');
  const [status, setStatus] = useState<PipelineStatus | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  async function startPipeline() {
    await fetch('/api/pipeline/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourcePath }),
    });
    startPolling();
  }

  function startPolling() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(async () => {
      const res = await fetch('/api/pipeline/status');
      const data = await res.json();
      setStatus(data);
      if (!data.running && intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }, 1000);
  }

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const progress = status ? (status.total > 0 ? (status.completed / status.total) * 100 : 0) : 0;

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">배치 Embedding 파이프라인</h1>

      <div className="flex gap-2">
        <Input
          value={sourcePath}
          onChange={(e) => setSourcePath(e.target.value)}
          placeholder="소스 경로 (로컬 폴더 또는 GCS 버킷)"
          className="flex-1"
        />
        <Button onClick={startPipeline} disabled={!sourcePath || status?.running}>
          <Play className="mr-2 h-4 w-4" /> 시작
        </Button>
      </div>

      {status && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <span className="font-medium">상태:</span>
            <Badge variant={status.running ? 'default' : 'secondary'}>
              {status.running ? '진행 중' : '완료'}
            </Badge>
            {status.currentFile && (
              <span className="text-sm text-muted-foreground">현재: {status.currentFile}</span>
            )}
          </div>

          <Progress value={progress} className="h-3" />
          <p className="text-sm text-muted-foreground">
            {status.completed} / {status.total} 파일 ({progress.toFixed(0)}%)
          </p>

          <div className="flex gap-4 text-sm">
            <span className="text-green-600">성공: {status.succeeded}</span>
            <span className="text-red-600">실패: {status.failed}</span>
            <span className="text-muted-foreground">대기: {status.total - status.completed}</span>
          </div>

          <ScrollArea className="h-48 border rounded p-3">
            {status.logs.map((log, i) => (
              <div key={i} className="flex items-center gap-2 py-1 text-sm">
                <span>{log.status === 'success' ? '✅' : '❌'}</span>
                <span className="flex-1 truncate">{log.fileName}</span>
                <span className="text-muted-foreground">{(log.duration / 1000).toFixed(1)}s</span>
                {log.message && <span className="text-red-500 text-xs truncate max-w-48">{log.message}</span>}
              </div>
            ))}
          </ScrollArea>
        </Card>
      )}
    </div>
  );
}
```

**Step 2: src/app/admin/pipeline/page.tsx 생성**

```tsx
import { PipelineDashboard } from '@/components/PipelineDashboard';
import Link from 'next/link';

export default function PipelinePage() {
  return (
    <div>
      <div className="border-b px-6 py-3 flex items-center justify-between">
        <span className="font-semibold">Admin: 파이프라인 관리</span>
        <Link href="/chat" className="text-sm text-muted-foreground hover:underline">
          ← 채팅으로 돌아가기
        </Link>
      </div>
      <PipelineDashboard />
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add src/components/PipelineDashboard.tsx src/app/admin/pipeline/page.tsx
git commit -m "feat: add admin pipeline dashboard UI"
```

---

### Task 14: Next.js 설정 및 최종 통합

**Files:**
- Modify: `next.config.ts`
- Modify: `src/app/layout.tsx`

**Step 1: next.config.ts 수정 — GCS 이미지 도메인 허용**

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
      },
    ],
  },
  serverExternalPackages: ['pdf-parse'],
};

export default nextConfig;
```

**Step 2: src/app/layout.tsx에 채팅/Admin 네비게이션 링크 추가**

루트 레이아웃에 Admin 링크가 하단에 포함되도록 수정 (채팅 페이지 하단에 "Admin: 배치 파이프라인 관리 →" 링크).

**Step 3: 개발 서버 실행 테스트**

```bash
pnpm dev
```

브라우저에서 `http://localhost:3000` 접속 → `/chat`으로 리다이렉트 확인.

**Step 4: Commit**

```bash
git add next.config.ts src/app/layout.tsx
git commit -m "feat: finalize Next.js config and layout integration"
```

---

### Task 15: lucide-react 아이콘 의존성 추가 및 전체 빌드 검증

**Step 1: 누락 의존성 확인 및 설치**

```bash
pnpm add lucide-react dotenv
```

**Step 2: 빌드 테스트**

```bash
pnpm build
```

모든 에러 해결 후 빌드 성공 확인.

**Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add missing dependencies and verify build"
```
