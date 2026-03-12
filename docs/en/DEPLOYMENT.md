# Deployment and Configuration Guide

This guide covers environment setup, database configuration, Google Cloud integration, and production considerations for the Gemini Multimodal RAG system.

## Environment Variables

Create a `.env.local` file in the project root. The application validates required variables at runtime and fails fast with a clear error message if any are missing.

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `GEMINI_API_KEY` | Google Gemini API key from [AI Studio](https://aistudio.google.com/) | `AIzaSy...` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@localhost:5432/rag_db` |
| `GCS_BUCKET_NAME` | Google Cloud Storage bucket name | `my-rag-files` |
| `GCS_PROJECT_ID` | Google Cloud project ID | `my-project-123` |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GOOGLE_APPLICATION_CREDENTIALS` | (none) | Path to a GCP service account JSON file. If omitted, Application Default Credentials (ADC) are used. |
| `GEMINI_EMBEDDING_MODEL` | `gemini-embedding-2-preview` | Embedding model name. Must support multimodal embedding. |
| `GEMINI_CHAT_MODEL` | `gemini-3.1-pro-preview` | Chat/generation model name. Used for streaming responses and content summaries. |

### Example `.env.local`

```env
GEMINI_API_KEY=AIzaSyA1B2C3D4E5F6G7H8I9J0
DATABASE_URL=postgresql://raguser:secretpassword@localhost:5432/rag_db
GCS_BUCKET_NAME=my-rag-files
GCS_PROJECT_ID=my-project-123
GOOGLE_APPLICATION_CREDENTIALS=./keys/service-account.json
```

---

## Database Setup

### Prerequisites

1. **PostgreSQL 15+** installed and running
2. **pgvector extension** installed ([installation guide](https://github.com/pgvector/pgvector#installation))

### Install pgvector

On Ubuntu/Debian:

```bash
sudo apt install postgresql-15-pgvector
```

On macOS with Homebrew:

```bash
brew install pgvector
```

On Docker:

```bash
docker run -d \
  --name postgres-pgvector \
  -e POSTGRES_USER=raguser \
  -e POSTGRES_PASSWORD=secretpassword \
  -e POSTGRES_DB=rag_db \
  -p 5432:5432 \
  pgvector/pgvector:pg16
```

### Create the Database

```sql
CREATE DATABASE rag_db;
```

### Run Schema Setup

The setup script creates the pgvector extension, all tables, and indexes:

```bash
npm run db:setup
```

This executes `src/scripts/setup-db.ts` and performs the following:

1. `CREATE EXTENSION IF NOT EXISTS vector` -- enables pgvector
2. Creates `embeddings` table with a `vector(3072)` column
3. Creates `conversations` table
4. Creates `messages` table with a foreign key to `conversations` (cascade delete)
5. Creates indexes:
   - `idx_embeddings_vector` -- IVFFlat index on the embedding column for fast cosine similarity search (with `lists = 100`)
   - `idx_embeddings_file_name` -- B-tree index on `file_name` for filename-based queries
   - `idx_messages_conversation` -- Composite B-tree index on `(conversation_id, created_at)` for message retrieval

**Note:** The IVFFlat index requires existing data to build. If the `embeddings` table is empty when the setup script runs, the index creation is caught and deferred. After inserting initial data, you can create it manually:

```sql
CREATE INDEX idx_embeddings_vector
  ON embeddings USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
```

### Schema Overview

```sql
-- Stores embedding vectors and metadata for all processed files
CREATE TABLE embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name VARCHAR(500) NOT NULL,
  file_type VARCHAR(50) NOT NULL,      -- text, pdf, image, audio, video
  file_path VARCHAR(1000) NOT NULL,    -- GCS proxy URL (/api/files/...)
  chunk_index INTEGER NOT NULL DEFAULT 0,
  chunk_text TEXT,                      -- Extracted text content
  content_summary TEXT,                 -- AI-generated description
  embedding vector(3072) NOT NULL,      -- Gemini embedding vector
  metadata JSONB DEFAULT '{}',          -- Extra metadata (page ranges, mimeType, etc.)
  created_at TIMESTAMP DEFAULT NOW()
);

-- Chat conversation containers
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200) NOT NULL DEFAULT 'New Conversation',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Individual chat messages
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
  role VARCHAR(20) NOT NULL,            -- 'user' or 'assistant'
  content TEXT NOT NULL,
  file_name VARCHAR(500),
  attachments JSONB DEFAULT '[]',       -- Media attachments from RAG results
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Google Cloud Storage Configuration

### Create a GCS Bucket

```bash
gsutil mb -p YOUR_PROJECT_ID -l us-central1 gs://your-bucket-name
```

### Authentication

The system supports two authentication methods:

**Option A: Service Account Key File (recommended for local development)**

1. Create a service account in the GCP Console
2. Grant it the `Storage Object Admin` role on the bucket
3. Download the JSON key file
4. Set `GOOGLE_APPLICATION_CREDENTIALS` to the file path in `.env.local`

**Option B: Application Default Credentials (recommended for production)**

If running on GCE, Cloud Run, or GKE, ADC is used automatically. Just ensure the compute service account has `Storage Object Admin` on the bucket.

For local development with ADC:

```bash
gcloud auth application-default login
```

### File Storage Structure

All uploaded files are stored under the `uploads/` prefix in the bucket:

```
gs://your-bucket/
  uploads/
    a1b2c3d4-uuid.pdf
    e5f6g7h8-uuid.png
    ...
```

Each file is assigned a UUID-based filename to avoid collisions. The original filename is preserved in the `file_name` column of the `embeddings` table.

### File Proxy Security

Files are served through `/api/files/...` which:
- Normalizes the request path using `path.posix.normalize()`
- Rejects paths that do not start with `uploads/`
- Rejects paths containing `..`
- Returns files with a `Cache-Control: public, max-age=86400` header (24-hour cache)

---

## Gemini API Setup

### Get an API Key

1. Visit [Google AI Studio](https://aistudio.google.com/)
2. Create or select a project
3. Generate an API key
4. Set it as `GEMINI_API_KEY` in `.env.local`

### Embedding Format Restrictions

The Gemini Embedding API (`gemini-embedding-2-preview`) has specific format and size restrictions for multimodal content. The system validates files against these restrictions before attempting to embed.

| Content Type | Supported Formats | Limit |
|-------------|-------------------|-------|
| **Text** | Any text content | Max 8,192 tokens |
| **PDF** | `.pdf` | Max 6 pages per embedding request (auto-split for larger PDFs) |
| **Image** | `.png`, `.jpg`, `.jpeg` | Max 6 images per request |
| **Audio** | `.mp3`, `.wav` | Max 80 seconds duration |
| **Video** | `.mp4`, `.mov` | Max 128 seconds duration; codecs: H264, H265, AV1, VP9 |

**Important notes:**

- Image formats like `.gif`, `.webp`, and `.bmp` are recognized by the file categorizer but are **not supported** by the Gemini Embedding API. Attempting to embed these will result in a validation error.
- Similarly, `.ogg`, `.flac`, and `.m4a` audio files and `.webm`, `.avi` video files are not supported for embedding.
- PDFs larger than 6 pages are automatically split into 6-page chunks using `pdf-lib`. Each chunk is embedded independently.
- Text files are split into chunks of 2,000 characters with 200-character overlap.

### Task Types

The system uses two Gemini embedding task types:

| Task Type | Used For |
|-----------|----------|
| `RETRIEVAL_DOCUMENT` | Embedding documents during the ingestion pipeline |
| `RETRIEVAL_QUERY` | Embedding user queries during RAG search |

Using matched task types improves retrieval quality by optimizing the embedding space for asymmetric search.

### Models Used

| Purpose | Model | SDK |
|---------|-------|-----|
| Embedding | `gemini-embedding-2-preview` | `@google/genai` (embedContent) |
| Chat streaming | `gemini-3.1-pro-preview` | `@ai-sdk/google` + Vercel AI SDK (streamText) |
| Translation | `gemini-3.1-pro-preview` | `@google/genai` (generateContent) |
| Content summary | `gemini-3.1-pro-preview` | `@google/genai` (generateContent) |

---

## Production Considerations

### Concurrency and Rate Limits

- The batch pipeline processes **3 files in parallel** with up to **3 retries** per failed file
- The pipeline upload endpoint (browser upload) processes with the same concurrency of 3 but without retries
- Gemini API rate limits vary by plan; monitor for 429 errors in pipeline logs
- Pipeline state is stored **in-memory** -- a server restart loses progress tracking (the database records persist)

### Database Performance

- The **IVFFlat** index provides approximate nearest neighbor search. For best performance with large datasets (100K+ vectors), consider increasing the `lists` parameter or switching to HNSW:

```sql
-- HNSW alternative (slower to build, faster queries)
CREATE INDEX idx_embeddings_vector_hnsw
  ON embeddings USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

- The `MIN_SIMILARITY` threshold is set to `0.3` in `rag.ts`. For large datasets with many similar documents, consider raising this value to reduce noise.
- The `topK` parameter for search defaults to `5` results.

### File Size Limits

| Limit | Value | Location |
|-------|-------|----------|
| Single file upload | 100 MB | `/api/embed` and `/api/pipeline/upload` |
| Message length | 10,000 characters | `/api/chat` |
| Pipeline log history | 100 entries (newest first) | `pipeline-state.ts` |

### Deployment Targets

**Vercel (recommended for Next.js):**
- Set environment variables in the Vercel dashboard
- The `maxDuration` for the chat endpoint is set to 60 seconds (requires a Pro plan for durations > 10s)
- Ensure the PostgreSQL database is accessible from Vercel's serverless functions (e.g., Neon, Supabase, or a VPC-peered database)

**Docker / Self-hosted:**

```bash
npm run build
npm start
```

Ensure environment variables are set and the database is reachable.

**Cloud Run:**
- Build a container with `next build` output
- Set environment variables via Cloud Run configuration
- Use ADC for GCS authentication (no key file needed)
- Connect to Cloud SQL PostgreSQL with pgvector via Cloud SQL Proxy or private IP

### Monitoring

- Pipeline progress is available via `GET /api/pipeline/status` and includes per-file success/error logs with timing data
- Server-side errors are logged to `console.error` with endpoint prefix (e.g., `POST /api/chat error:`)
- Database message saving after chat streaming is fire-and-forget; failures are logged but do not affect the user response

### Security Checklist

- [ ] `GEMINI_API_KEY` is not exposed to the client (server-side only via `env.ts`)
- [ ] `GOOGLE_APPLICATION_CREDENTIALS` file is in `.gitignore`
- [ ] GCS bucket has appropriate IAM policies (no public access unless intended)
- [ ] PostgreSQL connection uses SSL in production (`?sslmode=require` in `DATABASE_URL`)
- [ ] File proxy only serves files under the `uploads/` prefix
- [ ] Local pipeline paths are restricted to `./data` and `./uploads`
- [ ] UUID validation prevents injection in conversation/message queries
