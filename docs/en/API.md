# API Reference

All API endpoints are served from the Next.js App Router under `/api/`. Responses use JSON unless otherwise noted.

## Table of Contents

- [POST /api/chat](#post-apichat) -- RAG chat with streaming response
- [POST /api/embed](#post-apiembed) -- Single file embedding
- [POST /api/pipeline/start](#post-apipipelinestart) -- Start batch embedding pipeline
- [POST /api/pipeline/upload](#post-apipipelineupload) -- Upload files for batch embedding
- [GET /api/pipeline/status](#get-apipipelinestatus) -- Poll pipeline progress
- [GET /api/conversations](#get-apiconversations) -- List conversations
- [POST /api/conversations](#post-apiconversations) -- Create a conversation
- [DELETE /api/conversations](#delete-apiconversations) -- Delete a conversation
- [GET /api/files/...path](#get-apifilespath) -- Proxy GCS files
- [Streaming Protocol](#streaming-protocol)
- [Error Codes](#error-codes)

---

## POST /api/chat

Send a user message and receive a streaming RAG response. The endpoint performs vector search on embedded documents, builds a context-augmented prompt, and streams the Gemini response.

**Max Duration:** 60 seconds (via `maxDuration` export)

### Request

```
Content-Type: application/json
```

```json
{
  "message": "What does the document say about pricing?",
  "conversationId": "550e8400-e29b-41d4-a716-446655440000"
}
```

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `message` | string | Yes | Max 10,000 characters |
| `conversationId` | string (UUID) | Yes | Must match UUID v4 format |

### Response

```
Content-Type: text/plain; charset=utf-8
Transfer-Encoding: chunked
```

The response is a raw text stream. If relevant media (image/video) attachments are found, the stream begins with an attachment block followed by the LLM-generated text:

```
__ATTACHMENTS__[{"type":"image","path":"/api/files/uploads%2Fabc.png","fileName":"diagram.png","similarity":0.82}]__END_ATTACHMENTS__The document describes three pricing tiers...
```

See [Streaming Protocol](#streaming-protocol) for details on parsing.

### Example

```bash
curl -X POST http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{
    "message": "Explain the architecture diagram",
    "conversationId": "550e8400-e29b-41d4-a716-446655440000"
  }'
```

```javascript
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: 'Explain the architecture diagram',
    conversationId: conversationId,
  }),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();
let fullText = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  fullText += decoder.decode(value, { stream: true });
}

// Parse attachments from the beginning of fullText
const attachmentMatch = fullText.match(
  /^__ATTACHMENTS__(.*?)__END_ATTACHMENTS__/
);
if (attachmentMatch) {
  const attachments = JSON.parse(attachmentMatch[1]);
  fullText = fullText.slice(attachmentMatch[0].length);
}
```

---

## POST /api/embed

Upload a single file for embedding. The file is processed according to its type (text chunking, PDF splitting, or multimodal embedding), uploaded to GCS, and stored in the vector database.

### Request

```
Content-Type: multipart/form-data
```

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `file` | File | Yes | Max 100 MB, must be a supported type |

**Supported file types:**
- Text: `.txt`, `.md`, `.csv`, `.json`, `.xml`, `.html`
- PDF: `.pdf`
- Image: `.png`, `.jpg`, `.jpeg` (embedding API restriction)
- Audio: `.mp3`, `.wav` (embedding API restriction)
- Video: `.mp4`, `.mov` (embedding API restriction)

### Response

```json
{
  "success": true,
  "fileName": "report.pdf",
  "chunksCreated": 4
}
```

### Example

```bash
curl -X POST http://localhost:3000/api/embed \
  -F 'file=@./documents/report.pdf'
```

```javascript
const formData = new FormData();
formData.append('file', fileInput.files[0]);

const response = await fetch('/api/embed', {
  method: 'POST',
  body: formData,
});
const result = await response.json();
```

---

## POST /api/pipeline/start

Start a batch embedding pipeline from a local directory or GCS path. Processing runs in the background; use the status endpoint to poll progress.

### Request

```json
{
  "sourcePath": "./data"
}
```

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `sourcePath` | string | Yes | Local path (`./data`, `./uploads`) or GCS path (`gs://bucket/prefix`) |

**Local path restrictions:** Only `./data` and `./uploads` directories are allowed. Resolved paths must start with these base directories.

### Response

```json
{
  "started": true
}
```

### Example

```bash
# Local directory
curl -X POST http://localhost:3000/api/pipeline/start \
  -H 'Content-Type: application/json' \
  -d '{"sourcePath": "./data"}'

# GCS path
curl -X POST http://localhost:3000/api/pipeline/start \
  -H 'Content-Type: application/json' \
  -d '{"sourcePath": "gs://my-bucket/documents"}'
```

---

## POST /api/pipeline/upload

Upload multiple files from the browser for batch embedding. Files are read into memory and processed in the background.

### Request

```
Content-Type: multipart/form-data
```

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `files` | File[] | Yes | Multiple files, each max 100 MB, must be supported types |

Unsupported or oversized files are silently filtered out.

### Response

```json
{
  "started": true,
  "total": 12
}
```

### Example

```javascript
const formData = new FormData();
for (const file of selectedFiles) {
  formData.append('files', file);
}

const response = await fetch('/api/pipeline/upload', {
  method: 'POST',
  body: formData,
});
```

---

## GET /api/pipeline/status

Poll the current pipeline status. The pipeline dashboard typically polls this endpoint every 2 seconds.

### Response

```json
{
  "running": true,
  "total": 25,
  "completed": 10,
  "succeeded": 9,
  "failed": 1,
  "currentFile": "diagram.png",
  "logs": [
    {
      "fileName": "report.pdf",
      "status": "success",
      "duration": 4523
    },
    {
      "fileName": "corrupted.png",
      "status": "error",
      "message": "Unsupported image format for embedding: .gif",
      "duration": 120
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `running` | boolean | Whether the pipeline is currently active |
| `total` | number | Total number of files to process |
| `completed` | number | Files processed (succeeded + failed) |
| `succeeded` | number | Successfully embedded files |
| `failed` | number | Files that failed embedding |
| `currentFile` | string | Name of the file currently being processed |
| `logs` | array | Recent processing logs (max 100, newest first) |

### Example

```bash
curl http://localhost:3000/api/pipeline/status
```

---

## GET /api/conversations

List all conversations, ordered by most recently updated.

### Response

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "Architecture question",
    "createdAt": "2026-03-10T08:30:00.000Z",
    "updatedAt": "2026-03-10T09:15:00.000Z"
  }
]
```

---

## POST /api/conversations

Create a new conversation.

### Request

```json
{
  "title": "My new conversation"
}
```

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `title` | string | No | Max 200 characters. Defaults to the Korean string for "New Conversation" |

### Response

```json
{
  "id": "660e8400-e29b-41d4-a716-446655440000",
  "title": "My new conversation",
  "createdAt": "2026-03-12T10:00:00.000Z",
  "updatedAt": "2026-03-12T10:00:00.000Z"
}
```

---

## DELETE /api/conversations

Delete a conversation and all its messages (cascade).

### Request

Query parameter:

| Parameter | Type | Required | Constraints |
|-----------|------|----------|-------------|
| `id` | string (UUID) | Yes | Must match UUID v4 format |

### Response

```json
{
  "success": true
}
```

### Example

```bash
curl -X DELETE 'http://localhost:3000/api/conversations?id=550e8400-e29b-41d4-a716-446655440000'
```

---

## GET /api/files/...path

Proxy files stored in Google Cloud Storage. Only files under the `uploads/` GCS prefix are accessible. Responses include a 24-hour cache header.

### Path

The path segments after `/api/files/` are joined to form the GCS object path. For example:

```
GET /api/files/uploads%2Fabc-def.png
```

resolves to GCS object `uploads/abc-def.png`.

### Response

Returns the raw file bytes with the appropriate `Content-Type` header from GCS metadata.

```
Content-Type: image/png
Cache-Control: public, max-age=86400
```

### Security

- Path is normalized using `path.posix.normalize()`
- Must start with the `uploads/` prefix
- Paths containing `..` are rejected
- Returns 404 for any invalid or non-existent path

---

## Streaming Protocol

The `/api/chat` endpoint uses a custom streaming protocol over a `text/plain` response body. The stream may contain two sections:

### 1. Attachment Block (optional)

If the RAG search finds relevant image or video files with sufficient similarity, the stream begins with:

```
__ATTACHMENTS__<JSON array>__END_ATTACHMENTS__
```

The JSON array contains attachment objects:

```json
[
  {
    "type": "image",
    "path": "/api/files/uploads%2Fuuid.png",
    "fileName": "architecture-diagram.png",
    "similarity": 0.85
  }
]
```

**Attachment filtering logic:**
- Only `image` and `video` file types are considered
- Minimum similarity threshold: 0.4
- Among qualifying results, only those within 95% of the top similarity score are included

### 2. Text Stream

Following the optional attachment block, the remaining stream contains raw text chunks from the Gemini model response. These are plain text (not JSON) and can be concatenated directly.

### Client Parsing Example

```javascript
let raw = ''; // accumulated stream data

// After stream completes:
let attachments = [];
let text = raw;

const match = raw.match(/^__ATTACHMENTS__(.*?)__END_ATTACHMENTS__/);
if (match) {
  attachments = JSON.parse(match[1]);
  text = raw.slice(match[0].length);
}
```

---

## Error Codes

| Status | Meaning | When |
|--------|---------|------|
| 400 | Bad Request | Missing or invalid `message`, `file`, `sourcePath`, or unsupported file type |
| 403 | Forbidden | Local pipeline `sourcePath` outside allowed directories |
| 404 | Not Found | Local `sourcePath` does not exist, or GCS file not found |
| 500 | Internal Server Error | Unexpected server error (embedding failure, database error, etc.) |

### Error Response Format

All error responses follow this structure:

```json
{
  "error": "Description of the error"
}
```

### Specific Error Messages

| Endpoint | Error | Status |
|----------|-------|--------|
| `/api/chat` | `message is required` | 400 |
| `/api/chat` | `Valid conversationId is required` | 400 |
| `/api/chat` | `Message exceeds maximum length of 10000` | 400 |
| `/api/embed` | `No file provided` | 400 |
| `/api/embed` | `File size exceeds 100MB limit` | 400 |
| `/api/embed` | `Unsupported file type: <name>` | 400 |
| `/api/pipeline/start` | `sourcePath is required and must be a string` | 400 |
| `/api/pipeline/start` | `Access denied: sourcePath must be under ./data or ./uploads or a gs:// path` | 403 |
| `/api/pipeline/start` | `sourcePath does not exist` | 404 |
| `/api/pipeline/upload` | `No files provided` | 400 |
| `/api/pipeline/upload` | `No supported files found` | 400 |
| `/api/conversations` | `Valid UUID id required` | 400 |
| `/api/files/*` | `File not found` | 404 |
