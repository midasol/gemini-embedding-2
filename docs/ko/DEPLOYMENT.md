# Deployment and Configuration Guide

This document covers the deployment environment setup, external service configuration, and production considerations for the Gemini RAG system.

---

## Table of Contents

1. [Environment Variables Reference](#1-environment-variables-reference)
2. [Database Setup](#2-database-setup)
3. [Google Cloud Storage Setup](#3-google-cloud-storage-setup)
4. [Gemini API Setup](#4-gemini-api-setup)
5. [Embedding Format Limitations](#5-embedding-format-limitations)
6. [Production Considerations](#6-production-considerations)

---

## 1. Environment Variables Reference

Configure in the `.env.local` file. `env.ts` validates the presence of required variables.

### Required Environment Variables

| Variable | Description | Example |
|---|---|---|
| `GEMINI_API_KEY` | Google Gemini API key | `AIzaSy...` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@localhost:5432/gemini_rag` |
| `GCS_BUCKET_NAME` | Google Cloud Storage bucket name | `my-rag-bucket` |
| `GCS_PROJECT_ID` | GCP project ID | `my-gcp-project` |

### Optional Environment Variables

| Variable | Description | Default |
|---|---|---|
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to GCP service account JSON file | (uses ADC) |
| `GEMINI_EMBEDDING_MODEL` | Embedding model name | `gemini-embedding-2-preview` |
| `GEMINI_CHAT_MODEL` | Chat LLM model name | `gemini-3.1-pro-preview` |

### Environment Variables File Example

```env
# === Required ===
GEMINI_API_KEY=AIzaSyBxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
DATABASE_URL=postgresql://postgres:password@localhost:5432/gemini_rag
GCS_BUCKET_NAME=my-rag-files
GCS_PROJECT_ID=my-project-123456

# === Optional ===
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
GEMINI_EMBEDDING_MODEL=gemini-embedding-2-preview
GEMINI_CHAT_MODEL=gemini-3.1-pro-preview
```

---

## 2. Database Setup

### 2.1 PostgreSQL Installation and pgvector Extension

```bash
# macOS (Homebrew)
brew install postgresql@15
brew install pgvector

# Ubuntu/Debian
sudo apt install postgresql-15 postgresql-15-pgvector

# Docker
docker run -d \
  --name pgvector \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=gemini_rag \
  -p 5432:5432 \
  pgvector/pgvector:pg16
```

### 2.2 Enabling the pgvector Extension

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 2.3 Schema Initialization

Run the setup script included in the project:

```bash
npx tsx src/scripts/setup-db.ts
```

This script creates the following tables and indexes:

#### embeddings Table

```sql
CREATE TABLE embeddings (
    id SERIAL PRIMARY KEY,
    file_name VARCHAR NOT NULL,
    file_type VARCHAR NOT NULL,
    file_path VARCHAR NOT NULL,
    chunk_index INTEGER NOT NULL,
    chunk_text TEXT,
    content_summary TEXT,
    embedding VECTOR(3072) NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- IVFFlat index (for cosine similarity search)
CREATE INDEX embedding_idx ON embeddings
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- File name search index
CREATE INDEX file_name_idx ON embeddings (file_name);
```

#### conversations Table

```sql
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

#### messages Table

```sql
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role VARCHAR NOT NULL,
    content TEXT NOT NULL,
    file_name VARCHAR,
    attachments JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Index for querying messages by conversation
CREATE INDEX conv_created_idx ON messages (conversation_id, created_at);
```

### 2.4 IVFFlat Index Tuning

Adjust the `lists` parameter of the IVFFlat index based on the amount of data:

| Total Rows | Recommended `lists` Value |
|---|---|
| < 1,000 | 10 |
| 1,000 ~ 10,000 | 50 |
| 10,000 ~ 100,000 | 100 |
| 100,000 ~ 1,000,000 | 300-500 |
| > 1,000,000 | sqrt(number of rows) |

> IVFFlat indexes should be created after data has been loaded for optimal performance. It is recommended to recreate the index after the initial bulk data load.

---

## 3. Google Cloud Storage Setup

### 3.1 Bucket Creation

```bash
# gcloud CLI
gcloud storage buckets create gs://my-rag-files \
  --project=my-project-123456 \
  --location=asia-northeast3 \
  --uniform-bucket-level-access
```

### 3.2 Service Account Setup

```bash
# Create service account
gcloud iam service-accounts create rag-storage \
  --display-name="RAG Storage Account"

# Grant Storage permissions
gcloud projects add-iam-policy-binding my-project-123456 \
  --member="serviceAccount:rag-storage@my-project-123456.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"

# Generate key file
gcloud iam service-accounts keys create service-account.json \
  --iam-account=rag-storage@my-project-123456.iam.gserviceaccount.com
```

### 3.3 Authentication Methods

**Method 1: Service Account Key File** (Recommended - Local Development)

```env
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

**Method 2: ADC (Application Default Credentials)** (Recommended - GCE/Cloud Run)

```bash
gcloud auth application-default login
```

On GCE or Cloud Run, the service account attached to the instance is used automatically.

### 3.4 GCS Security

The system applies the following security mechanisms:

- **Path normalization**: Normalization via `path.normalize()`
- **Path traversal prevention**: Blocks paths containing `..`
- **Prefix validation**: Restricts allowed path scope with `ALLOWED_GCS_PREFIX`
- File access is only available through the proxy API (`/api/files/[...path]`)

---

## 4. Gemini API Setup

### 4.1 API Key Issuance

1. Visit [Google AI Studio](https://aistudio.google.com/)
2. Create an API key
3. Set it in the `GEMINI_API_KEY` environment variable

### 4.2 Models Used

| Purpose | Model | Environment Variable |
|---|---|---|
| Embedding | `gemini-embedding-2-preview` | `GEMINI_EMBEDDING_MODEL` |
| Chat | `gemini-3.1-pro-preview` | `GEMINI_CHAT_MODEL` |

### 4.3 Gemini API Call Purposes

The `gemini.ts` client calls the Gemini API for the following 3 purposes:

| Purpose | API Method | Description |
|---|---|---|
| **Embedding** | `embedContent` | Converts text/multimodal content to 3072-dimensional vectors |
| **Translation** | `generateContent` | Translates non-English queries to English (RAG bilingual search) |
| **Summarization** | `generateContent` | Generates content summaries for multimodal files (PDF, images, etc.) |

Chat LLM calls are performed separately through the Vercel AI SDK (`@ai-sdk/google`).

---

## 5. Embedding Format Limitations

Input format limitations for the Gemini Embedding API (`gemini-embedding-2-preview`).

### 5.1 Text

| Item | Limitation |
|---|---|
| Maximum tokens | 8,192 tokens |
| Chunking strategy | 2,000 characters / 200 character overlap |

### 5.2 Images

| Item | Limitation |
|---|---|
| Supported formats | PNG, JPEG |
| Maximum per request | 6 |
| Unsupported formats | GIF, WebP, BMP, TIFF, SVG, etc. |

### 5.3 Audio

| Item | Limitation |
|---|---|
| Supported formats | MP3, WAV |
| Maximum length | 80 seconds |
| Unsupported formats | OGG, FLAC, AAC, WMA, etc. |

### 5.4 Video

| Item | Limitation |
|---|---|
| Supported formats | MP4, MOV |
| Maximum length | 128 seconds |
| Supported codecs | H264, H265, AV1, VP9 |
| Unsupported formats | AVI, MKV, WebM, FLV, etc. |

### 5.5 PDF

| Item | Limitation |
|---|---|
| Maximum pages for multimodal embedding | 6 pages |
| Handling when exceeded | Automatic splitting into 6-page units using pdf-lib |

### 5.6 Format Limitations Summary Table

| Media Type | Supported Formats | Key Limitation |
|---|---|---|
| Text | All text files | 8,192 tokens |
| Image | PNG, JPEG | 6 per request |
| Audio | MP3, WAV | 80 seconds |
| Video | MP4, MOV | 128 seconds |
| PDF | PDF | 6 pages (auto-split) |

---

## 6. Production Considerations

### 6.1 Performance Optimization

#### Database

- **Connection pooling**: Adjust Drizzle ORM connection pool settings (PgBouncer recommended)
- **IVFFlat index**: Recreate index after bulk data loading
- **VACUUM**: Run `VACUUM ANALYZE embeddings` after bulk deletions
- **probes setting**: Adjust the trade-off between search accuracy and speed

```sql
-- Improve search accuracy (reduces speed)
SET ivfflat.probes = 10;
```

#### Pipeline

- Concurrent file processing: Default 3 files (considering Gemini API rate limit)
- Maximum 3 retries on failure
- In-memory state management (state is lost on server restart)

### 6.2 Scalability

```mermaid
graph TB
    subgraph Current["Current Architecture"]
        SingleServer["Single Next.js Server"]
        InMemoryState["In-Memory Pipeline State"]
        SingleDB["Single PostgreSQL"]
    end

    subgraph Scalable["Scalability Considerations"]
        LB["Load Balancer"]
        MultiServer["Multiple Next.js Instances"]
        Redis["Redis<br/>(Pipeline State)"]
        PGPool["PgBouncer<br/>(Connection Pool)"]
        ReadReplica["Read Replica<br/>(For Vector Search)"]
        CDN["CDN<br/>(GCS Proxy Caching)"]
    end

    SingleServer -.->|"When scaling"| LB
    LB --> MultiServer
    InMemoryState -.->|"When scaling"| Redis
    SingleDB -.->|"When scaling"| PGPool
    PGPool --> ReadReplica
```

#### Key Changes When Scaling

| Area | Current | Recommended When Scaling |
|---|---|---|
| Pipeline state | In-memory (`pipeline-state.ts`) | Redis or DB-based |
| DB connection | Direct connection | PgBouncer connection pool |
| File proxy | Direct handling by Next.js server | CDN caching + signed URLs |
| Vector index | IVFFlat | HNSW (higher accuracy, increased memory usage) |
| Batch processing | Processed within API server | Separate worker process / queue |

### 6.3 Security Checklist

- [ ] Manage `GEMINI_API_KEY` via environment variables/secret manager (no hardcoding in code)
- [ ] Minimize permissions for `GOOGLE_APPLICATION_CREDENTIALS` file (Storage Object Admin only)
- [ ] Use SSL connection for `DATABASE_URL` (`?sslmode=require`)
- [ ] Block public access to GCS bucket (Uniform bucket-level access)
- [ ] Place a reverse proxy (e.g., Nginx) in front of the Next.js server
- [ ] Verify CORS configuration
- [ ] Apply rate limiting

### 6.4 Monitoring

Recommended monitoring items:

| Item | Description |
|---|---|
| Gemini API response time | Embedding/chat API latency |
| Gemini API error rate | Rate limits, model errors, etc. |
| Vector search latency | pgvector query response time |
| DB connection count | PostgreSQL active connections |
| GCS upload/download | File transfer success rate |
| Pipeline failure rate | Percentage of failed files in batch processing |
| Memory usage | Especially during large file processing |

### 6.5 Deployment Platforms

| Platform | Suitability | Notes |
|---|---|---|
| **Vercel** | Suitable (with limitations) | Be mindful of serverless function time limits; pipeline requires a separate service |
| **Google Cloud Run** | Recommended | Same infrastructure as GCS/Gemini; configurable maximum request timeout |
| **GKE (Kubernetes)** | Recommended (large scale) | Full control; worker separation possible |
| **AWS ECS/Fargate** | Possible | Consider S3 instead of GCS |
| **Self-hosted** | Possible | Deploy with Docker Compose |

### 6.6 Docker Compose Example

```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://postgres:password@db:5432/gemini_rag
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - GCS_BUCKET_NAME=${GCS_BUCKET_NAME}
      - GCS_PROJECT_ID=${GCS_PROJECT_ID}
    depends_on:
      - db
    volumes:
      - ./service-account.json:/app/service-account.json:ro

  db:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_DB: gemini_rag
      POSTGRES_PASSWORD: password
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```
