# Gemini RAG System - Detailed Guide

> Codebase analysis and usage guide for the multimodal RAG (Retrieval-Augmented Generation) system powered by Google Gemini models

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Project Structure](#3-project-structure)
4. [Environment Setup & Installation](#4-environment-setup--installation)
5. [Core Library Modules (src/lib/)](#5-core-library-modules-srclib)
6. [API Routes (src/app/api/)](#6-api-routes-srcappapi)
7. [Frontend Components](#7-frontend-components)
8. [Database Schema](#8-database-schema)
9. [Data Flow Architecture](#9-data-flow-architecture)
10. [CLI Scripts](#10-cli-scripts)
11. [Configuration Files](#11-configuration-files)
12. [Key Configuration Reference](#12-key-configuration-reference)
13. [Security Considerations](#13-security-considerations)

---

## 1. Project Overview

This project is a **multimodal RAG system** powered by Google Gemini AI models. It converts various file formats (text, PDF, image, audio, video) into vector embeddings, stores them in PostgreSQL pgvector, and performs semantic search + AI response generation for user queries.

### Key Features

- **Batch Embedding Pipeline**: Bulk embed files from a folder (CLI + Web UI)
- **RAG Chat**: AI conversations based on vector search (streaming responses)
- **Single File Embedding**: Instantly embed files uploaded during chat
- **Multimodal Support**: Text/PDF chunking, image/audio/video AI summary generation

---

## 2. Tech Stack

| Area | Technology | Version |
|------|-----------|---------|
| **Framework** | Next.js (App Router) | 16.1.6 |
| **Language** | TypeScript | 5.x |
| **Embedding Model** | gemini-embedding-2-preview | 3072 dimensions |
| **LLM** | gemini-3.1-pro-preview | - |
| **DB** | PostgreSQL + pgvector | - |
| **ORM** | Drizzle ORM | 0.45.1 |
| **File Storage** | Google Cloud Storage | - |
| **AI Streaming** | Vercel AI SDK (@ai-sdk/google) | 3.x / 6.x |
| **PDF Parsing** | pdf-parse | 2.4.5 |
| **UI** | Tailwind CSS v4 + shadcn/ui | 4.x / 4.0.5 |
| **Package Manager** | pnpm | - |

---

## 3. Project Structure

```
gemini-embedding-2-test/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── layout.tsx                # Root layout (Inter font, metadata)
│   │   ├── page.tsx                  # Main page (redirects to /chat)
│   │   ├── globals.css               # Global CSS (Tailwind, color variables)
│   │   ├── chat/
│   │   │   └── page.tsx              # Chat UI (sidebar + chat window + input)
│   │   ├── admin/
│   │   │   └── pipeline/
│   │   │       └── page.tsx          # Batch pipeline management UI
│   │   └── api/
│   │       ├── chat/route.ts         # RAG query (streaming response)
│   │       ├── embed/route.ts        # Single file embedding
│   │       ├── conversations/route.ts # Conversation CRUD
│   │       ├── pipeline/
│   │       │   ├── start/route.ts    # Start batch pipeline
│   │       │   └── status/route.ts   # Progress query
│   │       └── files/[...path]/route.ts  # GCS file proxy
│   │
│   ├── lib/                          # Shared libraries
│   │   ├── env.ts                    # Centralized environment variable management
│   │   ├── gemini.ts                 # Gemini API client
│   │   ├── db.ts                     # PostgreSQL connection (Drizzle)
│   │   ├── schema.ts                # DB schema definitions
│   │   ├── embedding.ts             # Embedding generation logic
│   │   ├── rag.ts                    # RAG pipeline (search + prompt)
│   │   ├── file-parser.ts           # File type classification, parsing, chunking
│   │   ├── gcs.ts                    # GCS upload/download
│   │   ├── pipeline-state.ts        # Pipeline state (in-memory)
│   │   └── utils.ts                  # Tailwind CSS utility (cn)
│   │
│   ├── components/                   # React components
│   │   ├── ChatSidebar.tsx           # Conversation list sidebar
│   │   ├── ChatWindow.tsx            # Message display (Markdown rendering)
│   │   ├── ChatInput.tsx             # Message input + file attachment
│   │   ├── PipelineDashboard.tsx     # Pipeline management dashboard
│   │   └── ui/                       # shadcn/ui base components
│   │
│   └── scripts/                      # CLI scripts
│       ├── pipeline.ts               # Batch embedding CLI
│       └── setup-db.ts               # DB initialization
│
├── docs/plans/                       # Design documents
├── package.json
├── tsconfig.json
├── postcss.config.mjs
├── eslint.config.mjs
└── pnpm-workspace.yaml
```

---

## 4. Environment Setup & Installation

### 4.1 Install Dependencies

```bash
pnpm install
```

### 4.2 Configure Environment Variables

Create a `.env.local` file in the project root:

```env
# Required
GEMINI_API_KEY=your-gemini-api-key
DATABASE_URL=postgresql://user:pass@host:5432/dbname
GCS_BUCKET_NAME=your-bucket-name
GCS_PROJECT_ID=your-project-id

# Optional (defaults provided)
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
GEMINI_EMBEDDING_MODEL=gemini-embedding-2-preview
GEMINI_CHAT_MODEL=gemini-3.1-pro-preview
```

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GEMINI_API_KEY` | Yes | - | Google Gemini API key |
| `DATABASE_URL` | Yes | - | PostgreSQL connection string |
| `GCS_BUCKET_NAME` | Yes | - | GCS bucket name |
| `GCS_PROJECT_ID` | Yes | - | Google Cloud project ID |
| `GOOGLE_APPLICATION_CREDENTIALS` | No | undefined | Service account JSON path |
| `GEMINI_EMBEDDING_MODEL` | No | `gemini-embedding-2-preview` | Embedding model |
| `GEMINI_CHAT_MODEL` | No | `gemini-3.1-pro-preview` | Chat model |

### 4.3 Initialize the Database

```bash
pnpm db:setup
```

This command performs the following:
1. Installs the pgvector extension (`CREATE EXTENSION IF NOT EXISTS vector`)
2. Creates `embeddings`, `conversations`, `messages` tables
3. Creates vector index (IVFFlat), file name index, and messages composite index

### 4.4 Run the Development Server

```bash
pnpm dev          # Development server (http://localhost:3000)
pnpm build        # Production build
pnpm start        # Production server
pnpm lint         # ESLint check
```

---

## 5. Core Library Modules (src/lib/)

### 5.1 env.ts - Environment Variable Management

Centralized environment variable management with runtime validation of required variables via `requireEnv()`.

```typescript
// Usage
import { env } from '@/lib/env';

env.GEMINI_API_KEY;      // Required - throws Error if missing
env.GEMINI_CHAT_MODEL;   // Optional - defaults to 'gemini-3.1-pro-preview'
```

**Feature**: Lazy evaluation using getter functions (validated at time of use)

### 5.2 gemini.ts - Gemini API Client

Singleton client that communicates with the Google Gemini API.

| Export | Signature | Description |
|--------|----------|-------------|
| `genai` | `GoogleGenAI` instance | API client (singleton) |
| `generateEmbedding` | `(contents, taskType?) => Promise<number[]>` | Generate 3072-dimension vector |
| `generateContentSummary` | `(fileData, mimeType) => Promise<string>` | Multimodal file AI summary |

**Embedding Generation**:
```typescript
// Text embedding
const vector = await generateEmbedding("text to search", 'RETRIEVAL_DOCUMENT');

// Multimodal embedding (images, etc.)
const vector = await generateEmbedding(
  [{ inlineData: { mimeType: 'image/png', data: base64String } }],
  'RETRIEVAL_DOCUMENT'
);

// Query embedding
const queryVector = await generateEmbedding("user question", 'RETRIEVAL_QUERY');
```

**Content Summary**: Generates detailed descriptions of images/videos using AI prompts.

### 5.3 db.ts - Database Connection

PostgreSQL connection singleton based on Drizzle ORM + postgres-js.

```typescript
import { db } from '@/lib/db';

// Usage example
const result = await db.select().from(embeddings).where(...);
```

### 5.4 schema.ts - Database Schema

Defines 3 tables and indexes using Drizzle ORM. (See [8. Database Schema](#8-database-schema) for details)

### 5.5 embedding.ts - Embedding Generation Logic

Handles the entire process from receiving a file to GCS upload + vector generation + DB storage.

```typescript
export async function embedFile(fileBuffer: Buffer, fileName: string): Promise<EmbedResult>
```

**Processing Branches**:

| File Type | Processing Method | Result |
|-----------|------------------|--------|
| Text/PDF | Text extraction → Chunking (2000 chars, 200 overlap) → Per-chunk embedding | N records |
| Image/Audio/Video | Base64 → Multimodal embedding + AI summary | 1 record |

**Dependencies**: `gemini.ts`, `gcs.ts`, `file-parser.ts`, `db.ts`, `schema.ts`

### 5.6 rag.ts - RAG Pipeline

Vectorizes user queries to search for similar documents and constructs RAG prompts.

| Export | Signature | Description |
|--------|----------|-------------|
| `searchSimilar` | `(query, topK=5) => Promise<SearchResult[]>` | pgvector cosine similarity search |
| `buildRAGPrompt` | `(query, results) => string` | Build prompt from search results |

**Search SQL** (internal):
```sql
SELECT *, 1 - (embedding <=> query_vector::vector) AS similarity
FROM embeddings
ORDER BY embedding <=> query_vector::vector
LIMIT 5
```

### 5.7 file-parser.ts - File Parser

| Export | Description |
|--------|-------------|
| `FileCategory` | `'text' \| 'pdf' \| 'image' \| 'audio' \| 'video'` |
| `getFileCategory(fileName)` | Extension-based file classification |
| `getMimeType(fileName)` | Extension → MIME type mapping |
| `extractTextFromPDF(buffer)` | Extract text from PDF (pdf-parse) |
| `chunkText(text, 2000, 200)` | Split text into overlapping chunks |

**Supported File Formats**:

| Category | Extensions |
|----------|-----------|
| text | `.txt`, `.md`, `.csv`, `.json`, `.xml`, `.html` |
| pdf | `.pdf` |
| image | `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.bmp` |
| audio | `.mp3`, `.wav`, `.ogg`, `.flac`, `.m4a` |
| video | `.mp4`, `.webm`, `.avi`, `.mov` |

### 5.8 gcs.ts - Google Cloud Storage

| Export | Description |
|--------|-------------|
| `uploadToGCS(buffer, name, mime)` | Upload to GCS → returns `/api/files/{path}` proxy URL |
| `downloadFromGCS(gcsPath)` | Download from GCS (path validation + path traversal prevention) |

**Security**:
- File names are randomized using UUIDs
- Access scope limited with `uploads/` prefix
- Paths containing `..` are blocked

### 5.9 pipeline-state.ts - Pipeline State

In-memory state store that manages pipeline progress.

| Export | Description |
|--------|-------------|
| `PipelineStatus` | Status interface (running, total, completed, succeeded, failed, logs) |
| `getStatus()` | Returns shallow copy of current state |
| `resetStatus(total)` | Initialize on pipeline start |
| `updateStatus(partial)` | Partial state update |
| `addLog(log)` | Add log entry (maintains max 100, FIFO) |

### 5.10 Module Dependency Graph

```
env.ts (independent)
  ↑
  ├── gemini.ts ──→ embedding.ts (hub)
  ├── db.ts     ──→ embedding.ts
  └── gcs.ts    ──→ embedding.ts
                      ↑
schema.ts ────────────┤
file-parser.ts (independent) ─┘

gemini.ts ──→ rag.ts
db.ts     ──→ rag.ts

pipeline-state.ts (independent) ←── API Routes
utils.ts (independent) ←── UI Components
```

---

## 6. API Routes (src/app/api/)

### 6.1 POST /api/chat - RAG Chat (Streaming)

Performs vector search → RAG prompt → streaming response for user queries.

**Request**:
```json
{
  "message": "Your question (max 10,000 characters)",
  "conversationId": "UUID format"
}
```

**Response**: `text/plain; charset=utf-8` streaming
```
__ATTACHMENTS__[{type,path,fileName,similarity}]__END_ATTACHMENTS__streaming text...
```

**Processing Flow**:
1. Input validation (message length, UUID format)
2. `searchSimilar(message, 5)` → Search top 5 similar documents
3. Retrieve conversation history (messages table)
4. Save user message to DB
5. Filter media attachments (similarity >= top score * 0.95)
6. `buildRAGPrompt()` → Construct RAG prompt
7. `streamText()` → Gemini 3.1 Pro streaming response
8. Asynchronously save assistant response to DB + auto-generate conversation title

**Errors**: 400 (input error), 500 (server error)

### 6.2 POST /api/embed - Single File Embedding

**Request**: `multipart/form-data` (file field)

**Constraints**: Max 100MB, supported extensions only

**Response**:
```json
{ "success": true, "fileName": "doc.pdf", "chunksCreated": 5 }
```

**Errors**: 400 (no file/size exceeded/unsupported type), 500 (embedding failure)

### 6.3 GET|POST|DELETE /api/conversations - Conversation CRUD

| Method | Description | Request | Response |
|--------|-------------|---------|----------|
| GET | List (sorted by updatedAt desc) | - | `Conversation[]` |
| POST | Create new conversation | `{ title?: string }` | `Conversation` |
| DELETE | Delete conversation (CASCADE) | `?id=UUID` | `{ success: true }` |

### 6.4 POST /api/pipeline/start - Start Batch Pipeline

**Request**:
```json
{ "sourcePath": "./data/products" }
```

**Security Validation**:
- `ALLOWED_BASE_DIRS`: Only `./data` and `./uploads` are allowed
- Path traversal (`../`) is blocked

**Behavior**: Returns `{ started: true }` immediately, then processes in the background
- 5 files processed concurrently
- Up to 3 retries per file
- Real-time status updates via `pipeline-state.ts`

### 6.5 GET /api/pipeline/status - Pipeline Status Query

**Response**:
```json
{
  "running": true,
  "total": 150,
  "completed": 45,
  "succeeded": 43,
  "failed": 2,
  "currentFile": "document.pdf",
  "logs": [{ "fileName": "...", "status": "success", "duration": 1234 }]
}
```

### 6.6 GET /api/files/[...path] - GCS File Proxy

Proxies files stored in GCS.

- **Path Validation**: `uploads/` prefix required, `..` blocked
- **Caching**: `Cache-Control: public, max-age=86400` (1 day)
- **Response**: File binary + original Content-Type

---

## 7. Frontend Components

### 7.1 Page Structure

| Path | Component | Description |
|------|-----------|-------------|
| `/` | `page.tsx` | Redirects to `/chat` |
| `/chat` | `ChatPage` | Chat interface (sidebar + chat window + input) |
| `/admin/pipeline` | `PipelinePage` | Batch pipeline management |

### 7.2 ChatSidebar.tsx - Conversation List Sidebar

```typescript
interface ChatSidebarProps {
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}
```

- **Conversation List**: `GET /api/conversations` (re-fetched when activeId changes)
- **New Conversation**: `onNew()` callback
- **Delete Conversation**: `DELETE /api/conversations?id=` (delete button shown on group-hover)
- **Bottom**: Admin Pipeline link

### 7.3 ChatWindow.tsx - Message Display

```typescript
interface ChatWindowProps {
  messages: Message[];
  streamingContent?: string;
  streamingAttachments?: Attachment[];
  loading?: boolean;
}
```

- **Message Rendering**: User (right-aligned) / Assistant (left-aligned, Markdown)
- **Markdown**: `react-markdown` + `remark-gfm` (tables, code, links)
- **Image Attachments**: `AttachmentGrid` (opens in new tab on click, shows similarity)
- **Loading**: `ThinkingIndicator` (bouncing dots animation)
- **Auto-scroll**: Scrolls to latest message via `bottomRef`

### 7.4 ChatInput.tsx - Message Input

```typescript
interface ChatInputProps {
  onSend: (message: string, file?: File) => void;
  disabled?: boolean;
}
```

- **Text Input**: Enter to send, Shift+Enter for newline
- **File Attachment**: Paperclip button → hidden file input
- **Selected File**: Badge display + remove button

### 7.5 PipelineDashboard.tsx - Pipeline Management

- **Source path input** + start button
- **1-second polling**: `GET /api/pipeline/status`
- **Progress bar**: Completed/total ratio
- **Statistics**: Succeeded (green) / Failed (red) / Pending counts
- **Logs**: Recent processing results in ScrollArea (file name, status, duration)

### 7.6 Chat Page Data Flow (chat/page.tsx)

```
ChatPage (state management)
├── conversationId, messages, streaming, loading
├── createConversation() → POST /api/conversations
├── handleSend(message, file?)
│   ├── File + "embedding" keyword → POST /api/embed
│   └── Normal chat → POST /api/chat (streaming)
│       └── parseStreamChunk() → separate attachments + text
│
├── ChatSidebar (onSelect, onNew)
├── ChatWindow (messages, streamingContent)
└── ChatInput (onSend, disabled)
```

### 7.7 Design System

| Element | Value |
|---------|-------|
| Primary Color | `#5b5fc7` (purple) |
| Background | `#f7f8fc` |
| Foreground | `#1a1a2e` |
| Font | Inter (Google Fonts) |
| Sidebar Width | `w-72` (288px) |
| Content Max Width | `max-w-3xl` |
| Components | shadcn/ui (Button, Input, Card, Badge, Progress, Dialog, ScrollArea) |
| Icons | lucide-react |

---

## 8. Database Schema

### 8.1 Table Relationships

```
conversations (1)
    │
    │ 1:N (CASCADE DELETE)
    ↓
messages (N)
    │
    │ attachments JSONB → references search results
    ↓
embeddings (independent - vector search target)
```

### 8.2 embeddings Table

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, auto-generated | Record ID |
| `file_name` | varchar(500) | NOT NULL | Original file name |
| `file_type` | varchar(50) | NOT NULL | `text\|pdf\|image\|audio\|video` |
| `file_path` | varchar(1000) | NOT NULL | `/api/files/...` proxy URL |
| `chunk_index` | integer | NOT NULL, default 0 | Chunk order |
| `chunk_text` | text | nullable | Text chunk content |
| `content_summary` | text | nullable | Multimodal AI summary |
| `embedding` | vector(3072) | NOT NULL | Gemini embedding vector |
| `metadata` | jsonb | default `{}` | `{totalChunks}` or `{mimeType}` |
| `created_at` | timestamp | default NOW() | Creation time |

**Indexes**:
- `idx_embeddings_vector`: IVFFlat + vector_cosine_ops (vector search)
- `idx_embeddings_file_name`: File name search

### 8.3 conversations Table

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK | Conversation ID |
| `title` | varchar(200) | NOT NULL, default 'New Conversation' | Conversation title |
| `created_at` | timestamp | default NOW() | Creation time |
| `updated_at` | timestamp | default NOW() | Last updated |

### 8.4 messages Table

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK | Message ID |
| `conversation_id` | UUID | FK → conversations(CASCADE) | Parent conversation |
| `role` | varchar(20) | NOT NULL | `user` or `assistant` |
| `content` | text | NOT NULL | Message body |
| `file_name` | varchar(500) | nullable | Referenced file name |
| `attachments` | jsonb | default `[]` | `[{type, path, fileName, similarity}]` |
| `created_at` | timestamp | default NOW() | Creation time |

**Index**: `idx_messages_conversation` ON (conversation_id, created_at)

---

## 9. Data Flow Architecture

### 9.1 System Architecture Diagram

```
┌─────────────────────────────────────────────────┐
│                 User Interface                   │
│  ChatSidebar │ ChatWindow │ ChatInput            │
│  PipelineDashboard                               │
└──────────────────────┬──────────────────────────┘
                       │ API Calls
┌──────────────────────┴──────────────────────────┐
│              Next.js API Routes                  │
│  /api/chat  /api/embed  /api/conversations       │
│  /api/pipeline/start|status  /api/files/[...]    │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────┐
│              src/lib/ Shared Logic               │
│  gemini.ts  rag.ts  embedding.ts                 │
│  gcs.ts  file-parser.ts  db.ts                   │
└──────────┬───────────┬───────────┬──────────────┘
           │           │           │
    ┌──────┴──┐  ┌─────┴────┐ ┌───┴──────────┐
    │ Gemini  │  │   GCS    │ │  PostgreSQL  │
    │  API    │  │ Storage  │ │  + pgvector  │
    └─────────┘  └──────────┘ └──────────────┘
```

### 9.2 Batch Embedding Pipeline

```
File Scan (local directory)
  ↓
File Type Filtering (getFileCategory)
  ↓
Process 5 files in parallel (Promise.allSettled)
  ↓ (per file)
GCS Upload → Obtain proxy URL
  ↓
┌─ Text/PDF: Text extraction → Chunking (2000/200) → Per-chunk embedding
└─ Multimodal: Base64 → Embedding + AI summary
  ↓
Store in PostgreSQL embeddings table
  ↓
Update status (pipeline-state.ts)
```

- **Concurrency**: 5 files in parallel
- **Retries**: 3 retries on failure, then skip
- **Status Tracking**: In-memory, polled every second from Admin UI

### 9.3 RAG Chat Flow

```
User Query
  ↓
Vectorize: generateEmbedding(query, 'RETRIEVAL_QUERY')
  ↓
pgvector Cosine Similarity Search (top 5)
  ↓
Media Filtering (image/video, similarity >= top score * 0.95)
  ↓
Construct RAG Prompt (search results + user question)
  ↓
Gemini 3.1 Pro Streaming Response
  ↓
Send attachment metadata + streaming text
  ↓
Async: Save assistant message to DB + update conversation title
```

### 9.4 Single File Embedding Flow

```
Select file in chat UI + type "embedding" keyword
  ↓
POST /api/embed (FormData)
  ↓
File validation (100MB size, supported type)
  ↓
embedFile(buffer, fileName) → GCS + embedding + DB storage
  ↓
{ fileName, chunksCreated } response
```

---

## 10. CLI Scripts

### 10.1 Database Initialization (setup-db.ts)

```bash
pnpm db:setup
# or
npx tsx src/scripts/setup-db.ts
```

**Tasks Performed**:
1. Install pgvector extension
2. Create embeddings, conversations, messages tables
3. Create vector index (IVFFlat), file name index, messages index

**Example Output**:
```
Connecting to PostgreSQL...
1. Creating pgvector extension...
2. Creating tables...
3. Creating indexes...
Database setup complete!
```

### 10.2 Batch Embedding Pipeline (pipeline.ts)

```bash
pnpm pipeline -- ./data/products
# or
npx tsx src/scripts/pipeline.ts ./data/products
```

**Behavior**:
1. Load `.env.local` environment variables
2. Scan and filter files in the specified directory
3. Execute `embedFile()` in parallel (5 at a time)
4. Output results

**Example Output**:
```
Scanning: /path/to/products
Found 10 supported files
✅ product1.pdf (25 chunks)
✅ product2.png (1 chunks)
❌ Error: corrupted.pdf
Done: 9 succeeded, 1 failed
```

---

## 11. Configuration Files

### 11.1 tsconfig.json

- **Target**: ES2017, ESNext modules
- **Strict Mode**: `strict: true`
- **Path Aliases**: `@/*` → `./src/*`
- **Incremental Build**: `incremental: true`

### 11.2 postcss.config.mjs

Applies Tailwind CSS v4 as a PostCSS plugin.

### 11.3 eslint.config.mjs

ESLint v9+ flat config:
- `eslint-config-next/core-web-vitals` (performance optimization rules)
- `eslint-config-next/typescript` (TypeScript rules)
- Ignores `.next/`, `out/`, `build/`

### 11.4 globals.css

- Tailwind CSS v4 + tw-animate-css + shadcn/tailwind.css
- `@tailwindcss/typography` plugin
- Custom color variables (purple-based theme)
- Sidebar and chart color definitions (oklch color space)

---

## 12. Key Configuration Reference

| Setting | Value | Location |
|---------|-------|----------|
| Embedding Dimensions | 3072 | `gemini.ts`, `schema.ts` |
| Chunk Size | 2,000 characters | `file-parser.ts` |
| Chunk Overlap | 200 characters | `file-parser.ts` |
| Search Top K | 5 | `rag.ts` |
| Pipeline Concurrency | 5 files | `pipeline/start/route.ts`, `pipeline.ts` |
| Pipeline Retries | 3 times | `pipeline/start/route.ts` |
| Max File Size | 100 MB | `embed/route.ts` |
| Max Message Length | 10,000 characters | `chat/route.ts` |
| Similarity Threshold Ratio | 0.95 | `chat/route.ts` |
| Max Log Retention | 100 entries | `pipeline-state.ts` |
| Conversation Title Max Length | 200 chars (auto-generated: 30 chars) | `schema.ts`, `chat/route.ts` |
| File Cache TTL | 86,400 seconds (1 day) | `files/[...path]/route.ts` |
| Vector Index | IVFFlat + vector_cosine_ops | `schema.ts`, `setup-db.ts` |

---

## 13. Security Considerations

### Implemented Security

| Item | Implementation | Location |
|------|---------------|----------|
| Input Validation | Type, length, UUID format | All API routes |
| SQL Injection Prevention | Drizzle ORM parameter binding | `db.ts`, `rag.ts` |
| Path Traversal Prevention | `uploads/` prefix, `..` blocking | `gcs.ts` |
| Directory Access Restriction | `ALLOWED_BASE_DIRS` whitelist | `pipeline/start/route.ts` |
| GCS Proxy | Proxy URLs instead of public URLs | `gcs.ts`, `files/route.ts` |
| File Name Randomization | UUID-based GCS file names | `gcs.ts` |
| File Size Limit | 100MB | `embed/route.ts` |

### Not Implemented (Personal/Internal Project)

| Item | Status |
|------|--------|
| Authentication/Authorization | Not implemented |
| Rate Limiting | Not implemented |
| CORS Configuration | Next.js defaults |
| HTTPS | Needs configuration in deployment |
| Audit Logging | Not implemented |

---

## Appendix: Quick Reference

### API Endpoint Summary

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat` | POST | RAG chat (streaming) |
| `/api/embed` | POST | Single file embedding |
| `/api/conversations` | GET/POST/DELETE | Conversation CRUD |
| `/api/pipeline/start` | POST | Start batch pipeline |
| `/api/pipeline/status` | GET | Pipeline status query |
| `/api/files/[...path]` | GET | GCS file proxy |

### npm Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Development server |
| `pnpm build` | Production build |
| `pnpm start` | Production server |
| `pnpm lint` | ESLint check |
| `pnpm db:setup` | DB initialization |
| `pnpm pipeline -- <path>` | Batch embedding |

---

> Korean version: [GUIDE.ko.md](./GUIDE.ko.md)
