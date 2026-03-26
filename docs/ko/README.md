# Gemini RAG System

A multimodal RAG (Retrieval-Augmented Generation) system built on Next.js 15 App Router. It leverages Google Gemini models to embed files of various formats—text, PDF, images, audio, and video—and provides intelligent chat powered by vector search.

---

## Key Features

- **Multimodal Embedding**: Embed text, PDF, images, audio, and video with `gemini-embedding-2-preview` (3072 dimensions)
- **RAG-based Chat**: Hybrid search combining vector search + bilingual query translation + filename search
- **Streaming Responses**: Real-time streaming chat powered by Vercel AI SDK (gemini-3.1-pro-preview)
- **Batch Pipeline**: Bulk embedding of files from a local directory or GCS bucket
- **Multimodal Attachments**: Automatically attach related images/files to chat responses
- **Conversation Management**: Conversation history storage and sidebar UI

---

## Tech Stack

| Category | Technology |
|---|---|
| **Framework** | Next.js 15 (App Router) |
| **Language** | TypeScript |
| **AI Model (Embedding)** | Google Gemini `gemini-embedding-2-preview` (3072 dimensions) |
| **AI Model (Chat)** | Google Gemini `gemini-3.1-pro-preview` |
| **AI SDK** | Vercel AI SDK (`@ai-sdk/google`) |
| **Vector DB** | PostgreSQL + pgvector (cosine similarity) |
| **ORM** | Drizzle ORM |
| **File Storage** | Google Cloud Storage (GCS) |
| **UI Components** | shadcn/ui + Tailwind CSS |
| **Icons** | Lucide React |
| **Markdown Rendering** | ReactMarkdown |
| **PDF Processing** | pdf-lib |

---

## Quick Start

### Prerequisites

- **Node.js** 18 or higher
- **PostgreSQL** 15 or higher (pgvector extension must be installed)
- **Google Cloud** project (Gemini API key + GCS bucket)

### 1. Installation

```bash
git clone <repository-url>
cd gemini-embedding-2-test
npm install
```

### 2. Environment Setup

Create a `.env.local` file in the project root:

```env
# Required
GEMINI_API_KEY=your-gemini-api-key
DATABASE_URL=postgresql://user:password@localhost:5432/gemini_rag
GCS_BUCKET_NAME=your-gcs-bucket
GCS_PROJECT_ID=your-gcp-project-id

# Optional
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
GEMINI_EMBEDDING_MODEL=gemini-embedding-2-preview
GEMINI_CHAT_MODEL=gemini-3.1-pro-preview
```

### 3. Database Setup

```bash
# Install pgvector extension (PostgreSQL)
CREATE EXTENSION IF NOT EXISTS vector;

# Initialize schema
npx tsx src/scripts/setup-db.ts
```

### 4. Run

```bash
# Development server
npm run dev

# Production build
npm run build
npm start
```

Open `http://localhost:3000` in your browser and you will be automatically redirected to the `/chat` page.

---

## Project Structure

```
src/
├── app/                          # Next.js App Router
│   ├── layout.tsx, page.tsx      # Root layout (redirects to /chat)
│   ├── chat/page.tsx             # Chat UI (sidebar + conversation window)
│   ├── admin/pipeline/page.tsx   # Batch pipeline management UI
│   └── api/                      # API routes
│       ├── chat/route.ts         # RAG query (streaming response)
│       ├── embed/route.ts        # Single file embedding
│       ├── pipeline/             # Batch pipeline
│       ├── conversations/route.ts # Conversation CRUD
│       └── files/[...path]/route.ts # GCS file proxy
├── lib/                          # Core libraries
│   ├── gemini.ts                 # Gemini API client
│   ├── db.ts                     # PostgreSQL connection
│   ├── schema.ts                 # Drizzle schema
│   ├── embedding.ts              # Embedding logic
│   ├── rag.ts                    # RAG pipeline
│   ├── file-parser.ts            # File classification and parsing
│   ├── gcs.ts                    # GCS client
│   ├── env.ts                    # Environment variable validation
│   └── pipeline-state.ts         # Pipeline state management
├── components/                   # React components
│   ├── ChatSidebar.tsx           # Conversation list sidebar
│   ├── ChatWindow.tsx            # Message display
│   ├── ChatInput.tsx             # Text input + file upload
│   └── PipelineDashboard.tsx     # Pipeline management
└── scripts/                      # CLI scripts
    ├── pipeline.ts               # Batch embedding CLI
    └── setup-db.ts               # DB initialization
```

---

## CLI Usage

### Batch Embedding Pipeline

Bulk embed files from a local directory:

```bash
# Local directory
npx tsx src/scripts/pipeline.ts ./data

# GCS bucket
npx tsx src/scripts/pipeline.ts gs://your-bucket/path
```

### Database Initialization

```bash
npx tsx src/scripts/setup-db.ts
```

---

## API Endpoint Summary

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/chat` | RAG-based chat (streaming response) |
| `POST` | `/api/embed` | Single file embedding |
| `POST` | `/api/pipeline/start` | Start batch pipeline |
| `POST` | `/api/pipeline/upload` | Browser folder upload pipeline |
| `GET` | `/api/pipeline/status` | Query pipeline progress |
| `GET` | `/api/conversations` | List conversations |
| `POST` | `/api/conversations` | Create new conversation |
| `DELETE` | `/api/conversations` | Delete conversation |
| `GET` | `/api/files/[...path]` | GCS file proxy |

For detailed API documentation, see [API.md](./API.md).

---

## Supported File Formats

> Based on the [Gemini Embedding 2 official documentation](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/embedding-2).

### Formats Supported by the Gemini Embedding API

| Category | MIME Type | Limitations | Processing Method |
|----------|----------|---------|----------|
| Text | Plain text | Max 8,192 tokens | Chunking (2000 chars, 200 char overlap) then per-chunk embedding |
| PDF | `application/pdf` | Max 6 pages per request, 1 file | Split into 6-page units with pdf-lib, multimodal embedding + text extraction + AI summary |
| Image | `image/png`, `image/jpeg` | Max 6 per request | Base64 inlineData, multimodal embedding + AI summary |
| Audio | `audio/mp3`, `audio/wav` | Max 80 seconds, 1 file per request | Base64 inlineData, multimodal embedding + AI summary |
| Video | `video/mpeg`, `video/mp4` | 80 sec with audio / 120 sec without audio, 1 file per request | Base64 inlineData, multimodal embedding + AI summary |

### Additional Formats Accepted by the App

| Category | Extensions | Notes |
|----------|--------|------|
| Text | `.txt`, `.md`, `.csv`, `.json`, `.xml`, `.html` | Text extraction then chunking, text embedding |
| Image | `.gif`, `.webp`, `.bmp` | Upload/storage only -- not supported by Gemini Embedding API |
| Audio | `.ogg`, `.flac`, `.m4a` | Upload/storage only -- not supported by Gemini Embedding API |
| Video | `.webm`, `.avi`, `.mov` | Upload/storage only -- not supported by Gemini Embedding API |

---

## Related Documentation

- [Architecture](./ARCHITECTURE.md) - System architecture and Mermaid diagrams
- [API Reference](./API.md) - Detailed API documentation
- [Deployment Guide](./DEPLOYMENT.md) - Deployment and configuration guide
