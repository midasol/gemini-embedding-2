# Gemini RAG Chat

A multimodal RAG (Retrieval-Augmented Generation) chat system powered by Google Gemini models.
Converts text, PDF, image, audio, and video files into vector embeddings and provides semantic search + AI streaming responses.

---

## Prerequisites

Make sure the following are installed and configured before getting started.

### 1. Node.js

Node.js **20 or higher** is required.

```bash
# Check version
node -v
# Must be v20.x.x or higher

# Install (macOS - Homebrew)
brew install node

# Or install via nvm
nvm install 20
nvm use 20
```

### 2. pnpm

This project uses the pnpm package manager.

```bash
# Install
npm install -g pnpm

# Check version
pnpm -v
```

### 3. PostgreSQL + pgvector

PostgreSQL with the pgvector extension is required for vector similarity search.

```bash
# macOS - Homebrew
brew install postgresql@16
brew services start postgresql@16

# Install pgvector extension
brew install pgvector

# Create database
createdb gemini_rag
```

> The pgvector extension is automatically enabled when running `pnpm db:setup` (`CREATE EXTENSION IF NOT EXISTS vector`).

### 4. Google Cloud Account & API Key

#### Obtaining a Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Click "Create API Key"
3. Copy and save the API key

#### Google Cloud Storage (GCS) Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select an existing one)
3. Go to **Cloud Storage** > "Create Bucket" to create a bucket
4. Go to **IAM & Admin** > "Service Accounts" to create a service account
5. Grant the service account the **Storage Object Admin** role
6. Download the service account JSON key file

---

## Step-by-Step Installation Guide

### Step 1: Clone the Project

```bash
git clone <repository-url> gemini-rag-chat
cd gemini-rag-chat
```

### Step 2: Install Dependencies

```bash
pnpm install
```

Key packages installed:
- `@google/genai` - Gemini API client
- `@ai-sdk/google` + `ai` - Vercel AI SDK (streaming)
- `drizzle-orm` + `postgres` - PostgreSQL ORM
- `@google-cloud/storage` - GCS client
- `pdf-parse` - PDF text extraction
- `next` + `react` - Web framework

### Step 3: Configure Environment Variables

Create a `.env.local` file in the project root.

```bash
cp .env.local.example .env.local   # If an example file exists
# Or create manually
```

`.env.local` contents:

```env
# === Required ===

# Gemini API Key (obtain from https://aistudio.google.com/apikey)
GEMINI_API_KEY=your-gemini-api-key-here

# PostgreSQL connection string
DATABASE_URL=postgresql://username:password@localhost:5432/gemini_rag

# Google Cloud Storage
GCS_BUCKET_NAME=your-bucket-name
GCS_PROJECT_ID=your-gcp-project-id

# === Optional (defaults provided) ===

# GCS service account JSON path (uses ADC if not set)
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json

# Model names (can be omitted to use defaults)
# GEMINI_EMBEDDING_MODEL=gemini-embedding-2-preview
# GEMINI_CHAT_MODEL=gemini-3.1-pro-preview
```

> If you have a service account JSON file, save it as `service-account.json` in the project root.

### Step 4: Initialize the Database

```bash
pnpm db:setup
```

Expected output on success:

```
Connecting to PostgreSQL...
1. Creating pgvector extension...
   pgvector extension created.
2. Creating tables...
   embeddings table created.
   conversations table created.
   messages table created.
3. Creating indexes...
   indexes created.

Database setup complete!
```

> The IVFFlat vector index may be skipped if the table has no data. Re-run after the first embedding.

### Step 5: Start the Development Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser — it will automatically redirect to the `/chat` page.

---

## Usage

### 1. File Embedding (Batch Processing)

To embed all files in a folder, use the CLI or the Admin UI.

#### Batch Embedding via CLI

```bash
# Embed all files in the data folder
pnpm pipeline -- ./data

# Example: specific folder
pnpm pipeline -- ./data/products
```

Example output:
```
Scanning: /path/to/data
Found 10 supported files
✅ manual.pdf (25 chunks)
✅ product.png (1 chunks)
✅ guide.txt (3 chunks)
...
Done: 10 succeeded, 0 failed
```

#### Batch Embedding via Admin UI

1. Open [http://localhost:3000/admin/pipeline](http://localhost:3000/admin/pipeline) in your browser
2. Enter the source path (e.g., `./data`)
3. Click the "Start" button
4. Monitor real-time progress (auto-updates every second)

> For security, the Admin UI only allows access to `./data` and `./uploads` directories.

### 2. RAG Chat

1. Open [http://localhost:3000/chat](http://localhost:3000/chat)
2. Type a message — the AI will search embedded documents for relevant content and respond
3. If image files are found in search results, they will be displayed with thumbnails

### 3. Single File Embedding During Chat

1. Click the paperclip icon in the chat input to select a file
2. Include "embedding" in your message
   - Example: `Please embed this file`
3. The file will be uploaded to GCS and vector embeddings will be generated

---

## Testing

### Test 1: Verify Environment Variables

Confirm the server recognizes environment variables correctly.

```bash
# Start the dev server
pnpm dev

# Open in browser
open http://localhost:3000
```

If the `/chat` page loads successfully, the basic environment is configured correctly.

### Test 2: Verify Database Connection

```bash
# Connect to PostgreSQL directly and check tables
psql $DATABASE_URL -c "\dt"
```

Expected result:
```
           List of relations
 Schema |     Name      | Type  | Owner
--------+---------------+-------+-------
 public | conversations | table | user
 public | embeddings    | table | user
 public | messages      | table | user
```

### Test 3: Verify Conversation API

```bash
# Create a conversation
curl -X POST http://localhost:3000/api/conversations \
  -H "Content-Type: application/json" \
  -d '{"title": "Test Conversation"}'

# List conversations
curl http://localhost:3000/api/conversations
```

Expected result:
```json
[{"id":"uuid-...","title":"Test Conversation","createdAt":"...","updatedAt":"..."}]
```

### Test 4: File Embedding Test

Prepare test files and embed them.

```bash
# Create test data folder
mkdir -p ./data/test

# Create test text files
echo "Gemini is a multimodal AI model developed by Google.
It can understand and generate text, images, audio, and video." > ./data/test/gemini-info.txt

echo "The pgvector extension for PostgreSQL supports vector similarity search.
It provides operations such as cosine similarity, L2 distance, and inner product." > ./data/test/pgvector-info.txt

# Run embedding via CLI
pnpm pipeline -- ./data/test
```

Expected result:
```
Scanning: /path/to/data/test
Found 2 supported files
✅ gemini-info.txt (1 chunks)
✅ pgvector-info.txt (1 chunks)

Done: 2 succeeded, 0 failed
```

### Test 5: Verify Embeddings (DB Query)

```bash
psql $DATABASE_URL -c "SELECT file_name, file_type, chunk_index FROM embeddings;"
```

Expected result:
```
    file_name     | file_type | chunk_index
------------------+-----------+-------------
 gemini-info.txt  | text      |           0
 pgvector-info.txt| text      |           0
```

### Test 6: RAG Chat Test

```bash
# Create a conversation (note the ID)
CONV_ID=$(curl -s -X POST http://localhost:3000/api/conversations \
  -H "Content-Type: application/json" \
  -d '{}' | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

echo "Conversation ID: $CONV_ID"

# RAG chat query
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d "{\"message\": \"Tell me about the Gemini model\", \"conversationId\": \"$CONV_ID\"}"
```

If the AI responds based on the content from the embedded `gemini-info.txt`, the RAG pipeline is working correctly.

### Test 7: Single File Embedding API Test

```bash
# Embed a test file via API
curl -X POST http://localhost:3000/api/embed \
  -F "file=@./data/test/gemini-info.txt"
```

Expected result:
```json
{"success":true,"fileName":"gemini-info.txt","chunksCreated":1}
```

### Test 8: Full Flow in Browser

1. Open [http://localhost:3000/chat](http://localhost:3000/chat)
2. Check the conversation list in the left sidebar
3. Type a message: `What is the Gemini model?`
4. If a streaming response appears, it's working
5. Click the paperclip icon to upload a file, then type `Please embed this file`
6. Confirm the embedding completion message

---

## Supported File Formats

> Based on the official [Gemini Embedding 2 documentation](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/embedding-2).

### Gemini Embedding API Supported Formats

These formats are directly supported by the `gemini-embedding-2-preview` multimodal embedding API:

| Category | MIME Types | Restrictions | Processing Method |
|----------|-----------|-------------|-------------------|
| Text | Plain text | Max 8,192 tokens | Chunking (2000 chars, 200 overlap) → Embedding per chunk |
| PDF | `application/pdf` | Max 6 pages per request, 1 file per request | Split into 6-page chunks (pdf-lib) → Multimodal embedding + text extraction + AI summary |
| Image | `image/png`, `image/jpeg` | Max 6 images per request | Base64 inlineData → Multimodal embedding + AI summary |
| Audio | `audio/mp3`, `audio/wav` | Max 80 seconds, 1 file per request | Base64 inlineData → Multimodal embedding + AI summary |
| Video | `video/mpeg`, `video/mp4` | Max 80s (with audio) / 120s (without audio), 1 file per request | Base64 inlineData → Multimodal embedding + AI summary |

### Additional App-Supported Formats

The app accepts these additional formats for text extraction and storage, but they are processed as text (not multimodal embedding):

| Category | Extensions | Notes |
|----------|-----------|-------|
| Text | `.txt`, `.md`, `.csv`, `.json`, `.xml`, `.html` | Extracted as text → chunked → text embedding |
| Image | `.gif`, `.webp`, `.bmp` | Accepted for upload/storage but not supported by Gemini Embedding API |
| Audio | `.ogg`, `.flac`, `.m4a` | Accepted for upload/storage but not supported by Gemini Embedding API |
| Video | `.webm`, `.avi`, `.mov` | Accepted for upload/storage but not supported by Gemini Embedding API |

> **Note:** The `validateForEmbedding()` function in `file-parser.ts` validates files against the Gemini Embedding API restrictions before processing. Unsupported formats will be rejected at embedding time.

---

## Project Structure

```
src/
├── app/                       # Next.js App Router
│   ├── page.tsx               # / → /chat redirect
│   ├── chat/page.tsx          # Chat UI
│   ├── admin/pipeline/page.tsx # Pipeline management
│   └── api/                   # API endpoints
│       ├── chat/route.ts      # RAG chat (streaming)
│       ├── embed/route.ts     # Single file embedding
│       ├── conversations/     # Conversation CRUD
│       ├── pipeline/          # Batch pipeline
│       └── files/[...path]/   # GCS file proxy
├── lib/                       # Shared libraries
│   ├── gemini.ts              # Gemini API client
│   ├── db.ts                  # PostgreSQL connection
│   ├── schema.ts              # DB schema (Drizzle)
│   ├── embedding.ts           # Embedding generation logic
│   ├── rag.ts                 # RAG search + prompt
│   ├── file-parser.ts         # File parsing/chunking
│   ├── gcs.ts                 # GCS upload/download
│   └── env.ts                 # Environment variable management
├── components/                # React components
│   ├── ChatSidebar.tsx        # Conversation list
│   ├── ChatWindow.tsx         # Message display
│   ├── ChatInput.tsx          # Input + file attachment
│   └── PipelineDashboard.tsx  # Pipeline dashboard
└── scripts/                   # CLI scripts
    ├── setup-db.ts            # DB initialization
    └── pipeline.ts            # Batch embedding
```

---

## npm Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server (http://localhost:3000) |
| `pnpm build` | Production build |
| `pnpm start` | Start production server |
| `pnpm lint` | Run ESLint |
| `pnpm db:setup` | Initialize PostgreSQL tables and indexes |
| `pnpm pipeline -- <path>` | Batch embed files in a folder |

---

## Troubleshooting

### pgvector Installation Error

```
ERROR: could not open extension control file "vector"
```

pgvector is not installed in PostgreSQL:
```bash
# macOS
brew install pgvector

# Ubuntu
sudo apt install postgresql-16-pgvector

# Docker
docker run -p 5432:5432 pgvector/pgvector:pg16
```

### DATABASE_URL Connection Failure

```
ERROR: connection refused
```

Check if PostgreSQL is running:
```bash
# macOS
brew services list | grep postgresql
brew services start postgresql@16

# Test connection directly
psql postgresql://username:password@localhost:5432/gemini_rag
```

### GCS Authentication Error

```
ERROR: Could not load the default credentials
```

Check the service account JSON file path:
```bash
# Check path in .env.local
cat .env.local | grep GOOGLE_APPLICATION_CREDENTIALS

# Verify file exists
ls -la ./service-account.json
```

### IVFFlat Index Creation Failure

```
ERROR: at least 100 rows required for IVFFlat index
```

Re-run after enough data has been accumulated:
```bash
# First embed some files
pnpm pipeline -- ./data

# Re-run DB setup (creates index)
pnpm db:setup
```

### Gemini API 429 (Rate Limit)

```
ERROR: 429 Too Many Requests
```

Reduce concurrency or retry after a short wait. The batch pipeline automatically retries up to 3 times.

---

## Tech Stack

| Area | Technology |
|------|-----------|
| Framework | Next.js 16 (App Router), TypeScript |
| Embedding Model | gemini-embedding-2-preview (3072 dimensions) |
| LLM | gemini-3.1-pro-preview |
| DB | PostgreSQL + pgvector |
| ORM | Drizzle ORM |
| File Storage | Google Cloud Storage |
| AI Streaming | Vercel AI SDK |
| UI | Tailwind CSS v4 + shadcn/ui |

> For detailed architecture and code analysis, see [docs/GUIDE.md](./docs/GUIDE.md).
>
> Korean version: [README.ko.md](./README.ko.md)
