# Architecture

This document describes the system architecture of the Gemini Multimodal RAG system, including component diagrams, data flows, database design, and key sequence diagrams.

## System Overview

```mermaid
graph TB
    subgraph Client["Client Layer"]
        Browser["Browser (React 19)"]
    end

    subgraph NextJS["Next.js 15 App Router"]
        subgraph Pages["Pages"]
            ChatPage["Chat Page<br/>/chat"]
            AdminPage["Pipeline Admin<br/>/admin/pipeline"]
        end

        subgraph API["API Routes"]
            ChatAPI["POST /api/chat"]
            EmbedAPI["POST /api/embed"]
            PipelineStart["POST /api/pipeline/start"]
            PipelineUpload["POST /api/pipeline/upload"]
            PipelineStatus["GET /api/pipeline/status"]
            ConvAPI["GET|POST|DELETE<br/>/api/conversations"]
            FileProxy["GET /api/files/..."]
        end

        subgraph Lib["Core Libraries"]
            RAG["rag.ts<br/>Vector Search + Merge"]
            Embedding["embedding.ts<br/>File Processing"]
            GeminiClient["gemini.ts<br/>Gemini API Client"]
            FileParser["file-parser.ts<br/>Validation + Parsing"]
            GCS["gcs.ts<br/>Cloud Storage"]
            PipelineState["pipeline-state.ts<br/>In-Memory State"]
        end
    end

    subgraph External["External Services"]
        GeminiAPI["Google Gemini API<br/>Embedding + Chat"]
        GCSBucket["Google Cloud Storage<br/>File Storage"]
        PostgreSQL["PostgreSQL + pgvector<br/>Vector Database"]
    end

    Browser --> ChatPage
    Browser --> AdminPage
    ChatPage --> ChatAPI
    ChatPage --> ConvAPI
    AdminPage --> PipelineStart
    AdminPage --> PipelineUpload
    AdminPage --> PipelineStatus

    ChatAPI --> RAG
    ChatAPI --> GeminiClient
    EmbedAPI --> Embedding
    PipelineStart --> Embedding
    PipelineUpload --> Embedding
    PipelineStatus --> PipelineState
    FileProxy --> GCS

    RAG --> GeminiClient
    RAG --> PostgreSQL
    Embedding --> GeminiClient
    Embedding --> FileParser
    Embedding --> GCS
    Embedding --> PostgreSQL
    GeminiClient --> GeminiAPI
    GCS --> GCSBucket
```

## Tech Stack Layers

```mermaid
block-beta
    columns 1
    block:Presentation["Presentation Layer"]
        A["React 19 + Tailwind CSS 4 + shadcn/ui"]
        B["ReactMarkdown + remark-gfm"]
        C["Lucide Icons"]
    end
    block:Application["Application Layer"]
        D["Next.js 15 App Router"]
        E["Vercel AI SDK (streamText)"]
        F["API Routes (chat, embed, pipeline, files)"]
    end
    block:Domain["Domain Layer"]
        G["RAG Pipeline (rag.ts)"]
        H["Embedding Orchestration (embedding.ts)"]
        I["File Parsing + Validation (file-parser.ts)"]
    end
    block:Infrastructure["Infrastructure Layer"]
        J["Drizzle ORM + postgres driver"]
        K["@google/genai SDK"]
        L["@google-cloud/storage"]
    end
    block:External["External Services"]
        M["PostgreSQL + pgvector"]
        N["Gemini API"]
        O["Google Cloud Storage"]
    end

    Presentation --> Application
    Application --> Domain
    Domain --> Infrastructure
    Infrastructure --> External
```

## Data Flow: Batch Embedding Pipeline

```mermaid
flowchart TD
    A["Start Pipeline<br/>(local dir or gs:// path)"] --> B{Source Type?}
    B -->|Local| C["Read files from<br/>./data or ./uploads"]
    B -->|GCS| D["List files from<br/>GCS bucket prefix"]
    C --> E["Filter supported files<br/>(text, pdf, image, audio, video)"]
    D --> E
    E --> F["Reset pipeline status<br/>(total = file count)"]
    F --> G["Process batch of 3<br/>files in parallel"]

    G --> H{File Category?}

    H -->|Text| I["Read as UTF-8"]
    I --> J["Chunk text<br/>(2000 chars, 200 overlap)"]
    J --> K["Embed each chunk<br/>(RETRIEVAL_DOCUMENT)"]
    K --> L["Insert chunk rows<br/>into embeddings table"]

    H -->|PDF| M["Count pages"]
    M --> N{Pages > 6?}
    N -->|Yes| O["Split into 6-page<br/>chunks via pdf-lib"]
    N -->|No| P["Use as single chunk"]
    O --> Q["For each chunk:<br/>1. Multimodal embed (PDF inline)<br/>2. Extract text (pdf-parse)<br/>3. AI content summary"]
    P --> Q
    Q --> L

    H -->|Image/Audio/Video| R["Base64 encode"]
    R --> S["Multimodal embed<br/>(inlineData)"]
    S --> T["AI content summary"]
    T --> L

    G --> U["Upload original file<br/>to GCS"]
    U --> V["Update pipeline status<br/>(completed, succeeded/failed)"]
    V --> W{More files?}
    W -->|Yes| G
    W -->|No| X["Pipeline complete<br/>(running = false)"]

    style A fill:#4a90d9,color:#fff
    style X fill:#27ae60,color:#fff
```

## Data Flow: Chat RAG Query

```mermaid
flowchart TD
    A["User sends message<br/>+ conversationId"] --> B["Validate input<br/>(message string, UUID)"]
    B --> C["Save user message<br/>to messages table"]
    C --> D["searchSimilar(query, topK=5)"]

    D --> E["Generate embedding vector<br/>from original query"]
    E --> F["pgvector cosine search<br/>(similarity >= 0.3)"]

    D --> G{Query is<br/>non-English?}
    G -->|Yes| H["Translate to English<br/>via Gemini"]
    H --> I["Generate embedding<br/>from English translation"]
    I --> J["pgvector cosine search<br/>on translated vector"]
    G -->|No| K["Skip translation"]

    D --> L{Query contains<br/>filename pattern?}
    L -->|Yes| M["Filename-based DB search<br/>(case-insensitive match)"]
    L -->|No| N["Skip filename search"]

    F --> O["Merge & deduplicate<br/>all results by ID"]
    J --> O
    K --> O
    M --> O
    N --> O
    O --> P["Sort by similarity<br/>Return top K"]

    P --> Q["Build RAG prompt<br/>(context + question)"]
    Q --> R["Load conversation history<br/>from messages table"]
    R --> S["Stream response via<br/>Gemini + Vercel AI SDK"]

    S --> T{Has media<br/>attachments?}
    T -->|Yes| U["Prepend __ATTACHMENTS__<br/>JSON to stream"]
    T -->|No| V["Stream text directly"]
    U --> W["Stream text chunks"]
    V --> W
    W --> X["Save assistant message<br/>to DB (async)"]
    X --> Y["Update conversation title<br/>if first message"]

    style A fill:#4a90d9,color:#fff
    style W fill:#27ae60,color:#fff
```

## Data Flow: Single File Embedding

```mermaid
flowchart LR
    A["POST /api/embed<br/>(multipart form)"] --> B["Validate file<br/>(exists, size <= 100MB,<br/>supported type)"]
    B --> C["Determine file category<br/>(text/pdf/image/audio/video)"]
    C --> D["Validate format<br/>against Gemini limits"]
    D --> E["Upload to GCS<br/>(uploads/uuid.ext)"]
    E --> F["Process by category"]
    F --> G["Generate embedding<br/>vector(s)"]
    G --> H["Insert into<br/>embeddings table"]
    H --> I["Return success<br/>{fileName, chunksCreated}"]
```

## Database Entity Relationship Diagram

```mermaid
erDiagram
    CONVERSATIONS {
        uuid id PK "gen_random_uuid()"
        varchar title "max 200 chars"
        timestamp created_at "DEFAULT NOW()"
        timestamp updated_at "DEFAULT NOW()"
    }

    MESSAGES {
        uuid id PK "gen_random_uuid()"
        uuid conversation_id FK "NOT NULL, CASCADE delete"
        varchar role "user | assistant"
        text content "NOT NULL"
        varchar file_name "nullable, max 500"
        jsonb attachments "DEFAULT []"
        timestamp created_at "DEFAULT NOW()"
    }

    EMBEDDINGS {
        uuid id PK "gen_random_uuid()"
        varchar file_name "NOT NULL, max 500"
        varchar file_type "NOT NULL, max 50"
        varchar file_path "NOT NULL, max 1000 (GCS proxy URL)"
        integer chunk_index "NOT NULL, DEFAULT 0"
        text chunk_text "nullable (extracted text)"
        text content_summary "nullable (AI summary)"
        vector embedding "3072 dimensions, NOT NULL"
        jsonb metadata "DEFAULT {}"
        timestamp created_at "DEFAULT NOW()"
    }

    CONVERSATIONS ||--o{ MESSAGES : "has many"
```

### Indexes

| Table | Index Name | Type | Columns / Expression |
|-------|-----------|------|---------------------|
| `embeddings` | `idx_embeddings_vector` | IVFFlat | `embedding vector_cosine_ops` (lists=100) |
| `embeddings` | `idx_embeddings_file_name` | B-tree | `file_name` |
| `messages` | `idx_messages_conversation` | B-tree | `(conversation_id, created_at)` |

## API Route Structure

```mermaid
graph LR
    subgraph API["/api"]
        subgraph Chat["/chat"]
            ChatPOST["POST<br/>Streaming RAG response"]
        end

        subgraph Embed["/embed"]
            EmbedPOST["POST<br/>Single file embedding"]
        end

        subgraph Pipeline["/pipeline"]
            StartPOST["POST /start<br/>Batch from dir or GCS"]
            UploadPOST["POST /upload<br/>Browser file upload"]
            StatusGET["GET /status<br/>Progress polling"]
        end

        subgraph Conversations["/conversations"]
            ConvGET["GET<br/>List all"]
            ConvPOST["POST<br/>Create new"]
            ConvDELETE["DELETE ?id=uuid<br/>Delete one"]
        end

        subgraph Files["/files/...path"]
            FileGET["GET<br/>GCS file proxy"]
        end
    end
```

## Component Hierarchy

```mermaid
graph TD
    RootLayout["RootLayout<br/>(app/layout.tsx)"]

    RootLayout --> ChatPage["ChatPage<br/>(app/chat/page.tsx)"]
    RootLayout --> AdminPage["AdminPage<br/>(app/admin/pipeline/page.tsx)"]

    ChatPage --> ChatSidebar["ChatSidebar<br/>Conversation list,<br/>create/delete"]
    ChatPage --> ChatWindow["ChatWindow<br/>Message display,<br/>markdown rendering,<br/>image attachments"]
    ChatPage --> ChatInput["ChatInput<br/>Text input,<br/>file upload"]

    AdminPage --> PipelineDashboard["PipelineDashboard<br/>Source path input,<br/>folder upload,<br/>progress bar,<br/>file logs"]
```

## Sequence Diagram: Chat Message Flow

```mermaid
sequenceDiagram
    actor User
    participant UI as ChatWindow
    participant API as POST /api/chat
    participant RAG as rag.ts
    participant Gemini as Gemini API
    participant DB as PostgreSQL

    User->>UI: Type message & send
    UI->>API: POST {message, conversationId}
    API->>API: Validate (UUID, message length)

    API->>RAG: searchSimilar(message, 5)
    RAG->>Gemini: generateEmbedding(query)
    Gemini-->>RAG: vector[3072]

    RAG->>DB: pgvector cosine search
    DB-->>RAG: matched documents

    opt Non-English query
        RAG->>Gemini: translateQueryToEnglish(query)
        Gemini-->>RAG: English translation
        RAG->>Gemini: generateEmbedding(translated)
        Gemini-->>RAG: vector[3072]
        RAG->>DB: pgvector cosine search (English)
        DB-->>RAG: additional matches
    end

    opt Filename pattern detected
        RAG->>DB: SELECT WHERE file_name matches
        DB-->>RAG: filename matches
    end

    RAG->>RAG: Merge, deduplicate, sort by similarity
    RAG-->>API: SearchResult[]

    API->>DB: Load conversation history
    DB-->>API: previous messages[]

    API->>DB: INSERT user message
    API->>API: Build RAG prompt with context

    API->>Gemini: streamText(messages + RAG prompt)

    API-->>UI: Stream: __ATTACHMENTS__[...]__END_ATTACHMENTS__
    loop Text chunks
        Gemini-->>API: text chunk
        API-->>UI: Stream: text chunk
    end

    UI->>UI: Parse attachments + render markdown

    API->>DB: INSERT assistant message (async)
    API->>DB: UPDATE conversation title (if first message)
```

## Sequence Diagram: File Embedding Flow

```mermaid
sequenceDiagram
    actor User
    participant API as POST /api/embed
    participant Parser as file-parser.ts
    participant Embed as embedding.ts
    participant GCS as Google Cloud Storage
    participant Gemini as Gemini API
    participant DB as PostgreSQL

    User->>API: POST multipart/form-data (file)
    API->>API: Validate size <= 100MB
    API->>Parser: getFileCategory(fileName)
    Parser-->>API: category (text|pdf|image|audio|video)
    API->>Parser: validateForEmbedding(fileName)

    API->>Embed: embedFile(buffer, fileName)
    Embed->>GCS: uploadToGCS(buffer, fileName, mimeType)
    GCS-->>Embed: /api/files/uploads/uuid.ext

    alt Text file
        Embed->>Embed: chunkText(text, 2000, 200)
        loop Each chunk
            Embed->>Gemini: generateEmbedding(chunk, RETRIEVAL_DOCUMENT)
            Gemini-->>Embed: vector[3072]
            Embed->>DB: INSERT embedding row
        end
    else PDF file
        Embed->>Parser: getPDFPageCount(buffer)
        opt Pages > 6
            Embed->>Embed: splitPDF(buffer, 6) via pdf-lib
        end
        loop Each PDF chunk
            Embed->>Gemini: generateEmbedding(pdfInlineData)
            Gemini-->>Embed: vector[3072]
            Embed->>Parser: extractTextFromPDF(chunk)
            Embed->>Gemini: generateContentSummary(chunk)
            Gemini-->>Embed: AI summary text
            Embed->>DB: INSERT embedding row
        end
    else Image / Audio / Video
        Embed->>Gemini: generateEmbedding(base64InlineData)
        Gemini-->>Embed: vector[3072]
        Embed->>Gemini: generateContentSummary(base64, mimeType)
        Gemini-->>Embed: AI summary text
        Embed->>DB: INSERT embedding row
    end

    Embed-->>API: {fileName, chunksCreated}
    API-->>User: 200 {success, fileName, chunksCreated}
```

## Sequence Diagram: Batch Pipeline

```mermaid
sequenceDiagram
    actor Admin
    participant UI as PipelineDashboard
    participant StartAPI as POST /api/pipeline/start
    participant StatusAPI as GET /api/pipeline/status
    participant State as pipeline-state.ts
    participant Embed as embedding.ts

    Admin->>UI: Enter source path & click Start
    UI->>StartAPI: POST {sourcePath}
    StartAPI->>StartAPI: Validate path (GCS or allowed local dir)
    StartAPI-->>UI: 200 {started: true}

    Note over StartAPI: Background processing begins

    StartAPI->>StartAPI: List files from source
    StartAPI->>StartAPI: Filter supported file types
    StartAPI->>State: resetStatus(totalFiles)

    loop Batches of 3 files
        par 3 concurrent files
            StartAPI->>Embed: embedFile(buffer, name)
            Embed-->>StartAPI: result
            StartAPI->>State: updateStatus(completed++)
            StartAPI->>State: addLog({fileName, status, duration})
        end
    end

    StartAPI->>State: updateStatus(running: false)

    loop Every 2 seconds
        UI->>StatusAPI: GET
        StatusAPI->>State: getStatus()
        State-->>StatusAPI: PipelineStatus
        StatusAPI-->>UI: {running, total, completed, succeeded, failed, logs}
        UI->>UI: Update progress bar & log table
    end
```

## Security Architecture

```mermaid
flowchart TD
    subgraph InputValidation["Input Validation"]
        A["UUID regex on conversationId"]
        B["Message length limit: 10,000 chars"]
        C["File size limit: 100MB"]
        D["Supported file type check"]
        E["Gemini format validation"]
    end

    subgraph PathSecurity["Path Security"]
        F["GCS proxy: path.posix.normalize()"]
        G["GCS proxy: must start with uploads/"]
        H["GCS proxy: reject '..' segments"]
        I["Local pipeline: ALLOWED_BASE_DIRS<br/>(./data, ./uploads only)"]
    end

    subgraph DataSecurity["Data Security"]
        J["Environment variables via env.ts<br/>(lazy validation, fail fast)"]
        K["Service account credentials<br/>(file path, not inline)"]
        L["GCS files served with<br/>Cache-Control headers"]
    end
```
