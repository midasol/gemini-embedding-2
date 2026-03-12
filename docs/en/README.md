# Gemini Multimodal RAG System

A production-ready Retrieval-Augmented Generation system built with Next.js 15 that leverages Google's Gemini models for multimodal embedding and conversational AI. The system can embed, search, and reason over text, PDF, image, audio, and video files.

## Features

- **Multimodal Embedding** -- Embed text, PDF, images, audio, and video using `gemini-embedding-2-preview` (3072 dimensions)
- **Conversational RAG Chat** -- Streaming chat powered by `gemini-3.1-pro-preview` with retrieved document context
- **Bilingual Query Translation** -- Automatically translates non-English queries to English for improved vector search recall
- **Filename-aware Search** -- Detects filename patterns in queries and performs targeted database lookups
- **Batch Pipeline** -- Process entire directories (local or GCS) with parallel embedding, retry logic, and progress tracking
- **File Proxy with Security** -- Serves GCS-hosted files through a secure proxy with path traversal prevention
- **AI Content Summaries** -- Generates detailed descriptions for images, PDFs, audio, and video to enrich search context
- **Media Attachments in Chat** -- Automatically attaches relevant images and videos to chat responses

## Tech Stack

| Layer | Technology | Details |
|-------|-----------|---------|
| Framework | Next.js 15 | App Router, Server Components |
| Language | TypeScript 5 | Strict typing throughout |
| Embedding Model | gemini-embedding-2-preview | 3072-dimensional vectors |
| Chat Model | gemini-3.1-pro-preview | Via Vercel AI SDK streaming |
| Vector Database | PostgreSQL + pgvector | Cosine similarity, IVFFlat index |
| ORM | Drizzle ORM | Type-safe queries |
| File Storage | Google Cloud Storage | Proxied via `/api/files/` |
| UI Framework | React 19 + Tailwind CSS 4 | shadcn/ui components |
| Icons | Lucide React | Consistent icon set |
| Markdown | ReactMarkdown + remark-gfm | Rich message rendering |
| PDF Processing | pdf-lib + pdf-parse | Splitting and text extraction |

## Quick Start

### Prerequisites

- **Node.js** 20+ and npm
- **PostgreSQL** 15+ with the [pgvector](https://github.com/pgvector/pgvector) extension installed
- **Google Cloud** project with a GCS bucket
- **Gemini API key** from [Google AI Studio](https://aistudio.google.com/)

### 1. Clone and Install

```bash
git clone <repository-url>
cd gemini-embedding-2-test
npm install
```

### 2. Configure Environment

Create a `.env.local` file in the project root:

```env
# Required
GEMINI_API_KEY=your-gemini-api-key
DATABASE_URL=postgresql://user:password@localhost:5432/rag_db
GCS_BUCKET_NAME=your-gcs-bucket
GCS_PROJECT_ID=your-gcp-project-id

# Optional
GOOGLE_APPLICATION_CREDENTIALS=./path/to/service-account.json
GEMINI_EMBEDDING_MODEL=gemini-embedding-2-preview
GEMINI_CHAT_MODEL=gemini-3.1-pro-preview
```

### 3. Set Up the Database

```bash
npm run db:setup
```

This creates the pgvector extension, all tables (`embeddings`, `conversations`, `messages`), and indexes.

### 4. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) -- you will be redirected to the chat interface at `/chat`.

### 5. Embed Some Files

Use the admin pipeline UI at `/admin/pipeline` or the CLI:

```bash
# From a local directory
npm run pipeline -- ./data

# From a GCS bucket path
npm run pipeline -- gs://your-bucket/documents
```

## Project Structure

```
src/
├── app/
│   ├── layout.tsx                    # Root layout
│   ├── page.tsx                      # Redirects to /chat
│   ├── chat/page.tsx                 # Chat UI (sidebar + conversation window)
│   ├── admin/pipeline/page.tsx       # Batch pipeline admin UI
│   └── api/
│       ├── chat/route.ts             # RAG query endpoint (streaming)
│       ├── embed/route.ts            # Single file embedding endpoint
│       ├── pipeline/
│       │   ├── start/route.ts        # Batch pipeline trigger
│       │   ├── upload/route.ts       # Browser file upload pipeline
│       │   └── status/route.ts       # Pipeline progress polling
│       ├── conversations/route.ts    # Conversation CRUD
│       └── files/[...path]/route.ts  # GCS file proxy
├── lib/
│   ├── gemini.ts                     # Gemini API client (embed, translate, summarize)
│   ├── db.ts                         # PostgreSQL connection via Drizzle
│   ├── schema.ts                     # Drizzle table definitions
│   ├── embedding.ts                  # Embedding orchestration (text chunking, PDF split, multimodal)
│   ├── rag.ts                        # RAG pipeline (vector search, translation, merging)
│   ├── file-parser.ts                # File categorization, MIME types, validation
│   ├── gcs.ts                        # GCS upload/download with security
│   ├── env.ts                        # Environment variable validation
│   └── pipeline-state.ts            # In-memory pipeline status tracking
├── components/
│   ├── ChatSidebar.tsx               # Conversation list sidebar
│   ├── ChatWindow.tsx                # Message display with markdown + attachments
│   ├── ChatInput.tsx                 # Text input + file upload
│   └── PipelineDashboard.tsx         # Pipeline admin with progress bar
└── scripts/
    ├── pipeline.ts                   # CLI batch embedding script
    └── setup-db.ts                   # Database schema initialization
```

## CLI Usage

### Batch Embedding Pipeline

Embed all supported files from a local directory or GCS path:

```bash
# Local directory
npm run pipeline -- ./data

# GCS path
npm run pipeline -- gs://my-bucket/documents/batch1
```

The CLI processes files with a concurrency of 3 and reports success/failure counts.

### Database Setup

Initialize or reset the database schema:

```bash
npm run db:setup
```

## API Endpoints Summary

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/chat` | Send a message and receive a streaming RAG response |
| `POST` | `/api/embed` | Upload and embed a single file |
| `POST` | `/api/pipeline/start` | Start batch embedding from a local dir or GCS path |
| `POST` | `/api/pipeline/upload` | Upload and embed multiple files from the browser |
| `GET`  | `/api/pipeline/status` | Poll pipeline progress |
| `GET`  | `/api/conversations` | List all conversations |
| `POST` | `/api/conversations` | Create a new conversation |
| `DELETE` | `/api/conversations?id=<uuid>` | Delete a conversation |
| `GET`  | `/api/files/<path>` | Proxy a file from GCS |

For detailed API documentation, see [API.md](./API.md).

## Related Documentation

- [Architecture](./ARCHITECTURE.md) -- System design, data flows, and diagrams
- [API Reference](./API.md) -- Detailed endpoint documentation
- [Deployment Guide](./DEPLOYMENT.md) -- Environment variables, database setup, and production configuration
