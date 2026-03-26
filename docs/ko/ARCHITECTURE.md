# Architecture Document

Describes the overall architecture of the Gemini RAG system. All diagrams are written in Mermaid syntax.

---

## 1. System Overview

```mermaid
graph TB
    subgraph Client["Client (Browser)"]
        ChatUI["Chat UI<br/>/chat"]
        AdminUI["Pipeline Management UI<br/>/admin/pipeline"]
    end

    subgraph NextJS["Next.js 15 App Router"]
        subgraph API["API Routes"]
            ChatAPI["/api/chat<br/>RAG Query + Streaming"]
            EmbedAPI["/api/embed<br/>Single File Embedding"]
            PipelineAPI["/api/pipeline/*<br/>Batch Pipeline"]
            ConvAPI["/api/conversations<br/>Conversation CRUD"]
            FilesAPI["/api/files/[...path]<br/>GCS Proxy"]
        end

        subgraph Lib["Core Libraries (src/lib/)"]
            RAG["rag.ts<br/>RAG Pipeline"]
            Embedding["embedding.ts<br/>Embedding Logic"]
            GeminiClient["gemini.ts<br/>Gemini API Client"]
            FileParser["file-parser.ts<br/>File Classification/Parsing"]
            GCSLib["gcs.ts<br/>GCS Client"]
            DB["db.ts<br/>Drizzle ORM"]
            PipelineState["pipeline-state.ts<br/>State Management"]
        end
    end

    subgraph External["External Services"]
        Gemini["Google Gemini API<br/>Embedding + Chat + Translation"]
        GCS["Google Cloud Storage<br/>File Storage"]
        PG["PostgreSQL + pgvector<br/>Vector DB"]
    end

    ChatUI -->|"Send Message"| ChatAPI
    ChatUI -->|"Conversation Management"| ConvAPI
    ChatUI -->|"File Lookup"| FilesAPI
    AdminUI -->|"Pipeline Control"| PipelineAPI

    ChatAPI --> RAG
    ChatAPI --> GeminiClient
    EmbedAPI --> Embedding
    PipelineAPI --> Embedding
    PipelineAPI --> PipelineState
    FilesAPI --> GCSLib

    RAG --> DB
    RAG --> GeminiClient
    Embedding --> GeminiClient
    Embedding --> FileParser
    Embedding --> GCSLib
    Embedding --> DB

    GeminiClient --> Gemini
    GCSLib --> GCS
    DB --> PG
```

---

## 2. Technology Stack Layers

```mermaid
graph TB
    subgraph Presentation["Presentation Layer"]
        React["React Components"]
        Tailwind["Tailwind CSS"]
        ShadcnUI["shadcn/ui"]
        Lucide["Lucide Icons"]
        ReactMD["ReactMarkdown"]
    end

    subgraph Application["Application Layer"]
        NextApp["Next.js 15 App Router"]
        VercelAI["Vercel AI SDK<br/>Streaming"]
        APIRoutes["API Route Handlers"]
    end

    subgraph Domain["Domain Layer"]
        RAGPipeline["RAG Pipeline<br/>(rag.ts)"]
        EmbeddingEngine["Embedding Engine<br/>(embedding.ts)"]
        FileProcessor["File Processor<br/>(file-parser.ts)"]
        GeminiSDK["Gemini Client<br/>(gemini.ts)"]
    end

    subgraph Infrastructure["Infrastructure Layer"]
        DrizzleORM["Drizzle ORM<br/>(db.ts, schema.ts)"]
        GCSClient["GCS Client<br/>(gcs.ts)"]
        PipelineMgr["Pipeline State<br/>(pipeline-state.ts)"]
        EnvConfig["Environment Variable Validation<br/>(env.ts)"]
    end

    subgraph External["External Services"]
        GeminiAPI["Google Gemini API"]
        GCSService["Google Cloud Storage"]
        PostgreSQL["PostgreSQL + pgvector"]
    end

    Presentation --> Application
    Application --> Domain
    Domain --> Infrastructure
    Infrastructure --> External
```

---

## 3. Data Flow

### 3.1 Batch Embedding Pipeline

```mermaid
sequenceDiagram
    participant User as User/Admin
    participant UI as PipelineDashboard
    participant API as /api/pipeline/start
    participant State as pipeline-state.ts
    participant Embed as embedding.ts
    participant Parser as file-parser.ts
    participant Gemini as Gemini API
    participant GCS as Google Cloud Storage
    participant DB as PostgreSQL

    User->>UI: Enter directory path
    UI->>API: POST {source, path}
    API->>State: Create pipeline (pipelineId)
    API-->>UI: 202 Accepted {pipelineId}

    loop Iterate file list (3 parallel)
        API->>Parser: Classify file (MIME type)
        Parser-->>API: fileType, mimeType

        alt Text file
            API->>Embed: Text chunking (2000 chars, 200 char overlap)
            Embed->>GCS: Upload original file
            loop Each chunk
                Embed->>Gemini: Text embedding request
                Gemini-->>Embed: 3072-dimension vector
                Embed->>DB: INSERT embeddings
            end
        else PDF file
            API->>Embed: Split into 6-page units with pdf-lib
            Embed->>GCS: Upload original file
            loop Each PDF chunk
                Embed->>Gemini: Multimodal embedding (PDF)
                Gemini-->>Embed: 3072-dimension vector
                Embed->>Gemini: Text extraction + AI summary
                Gemini-->>Embed: Text + summary
                Embed->>DB: INSERT embeddings
            end
        else Image/Audio/Video
            Embed->>GCS: Upload original file
            Embed->>Gemini: base64 multimodal embedding
            Gemini-->>Embed: 3072-dimension vector
            Embed->>Gemini: AI content summary
            Gemini-->>Embed: Summary text
            Embed->>DB: INSERT embeddings
        end

        API->>State: Update progress
    end

    Note over API,State: Up to 3 retries on failure

    loop Progress polling
        UI->>API: GET /api/pipeline/status?id={pipelineId}
        API->>State: Query current state
        State-->>API: {total, completed, failed, status}
        API-->>UI: Progress JSON
    end
```

### 3.2 Chat RAG Query Flow

```mermaid
sequenceDiagram
    participant User as User
    participant UI as ChatWindow
    participant API as /api/chat
    participant RAG as rag.ts
    participant Gemini as Gemini API
    participant DB as PostgreSQL
    participant GCS as GCS Proxy

    User->>UI: Enter message
    UI->>API: POST {message, conversationId}
    API->>API: UUID validation + message length validation (10000 chars)

    API->>RAG: Search similar documents (query)

    par Vector search
        RAG->>Gemini: Query embedding
        Gemini-->>RAG: Query vector
        RAG->>DB: pgvector cosine similarity search
        DB-->>RAG: Similar document list
    and Bilingual search (non-English query)
        RAG->>Gemini: Translate to English
        Gemini-->>RAG: English query
        RAG->>Gemini: Translated query embedding
        Gemini-->>RAG: Translated query vector
        RAG->>DB: pgvector cosine similarity search
        DB-->>RAG: Additional similar documents
    and Filename search (when filename pattern included)
        RAG->>DB: Filename LIKE search
        DB-->>RAG: Filename match documents
    end

    RAG->>RAG: Merge results + deduplicate IDs + sort by similarity
    RAG->>RAG: MIN_SIMILARITY(0.3) filter + select top K
    RAG-->>API: Search results (context + attachments)

    API->>API: Compose RAG prompt

    API-->>UI: ReadableStream start
    Note over API,UI: __ATTACHMENTS__...json...__END_ATTACHMENTS__

    API->>Gemini: Streaming generation request
    loop Stream chunks
        Gemini-->>API: Text chunk
        API-->>UI: Stream transmission
    end

    UI->>GCS: Load attached images (/api/files/...)

    API->>DB: Async message save (user + assistant)
```

### 3.3 Single File Embedding Flow

```mermaid
flowchart TD
    A["POST /api/embed<br/>File Upload"] --> B{"File Classification<br/>(file-parser.ts)"}

    B -->|Text| C["Text Chunking<br/>2000 chars / 200 char overlap"]
    B -->|PDF| D["pdf-lib<br/>Split into 6-page units"]
    B -->|Image/Audio/Video| E["base64 Encoding<br/>Format Validation"]

    C --> F["GCS Upload"]
    D --> F
    E --> F

    F --> G{"Processing by File Type"}

    G -->|Text chunk| H["Gemini Text Embedding<br/>(each chunk)"]
    G -->|PDF chunk| I["Gemini Multimodal Embedding<br/>+ Text Extraction + AI Summary"]
    G -->|Media file| J["Gemini Multimodal Embedding<br/>+ AI Content Summary"]

    H --> K["PostgreSQL Save<br/>(embeddings table)"]
    I --> K
    J --> K

    K --> L["200 OK<br/>{fileName, chunks, fileType}"]
```

---

## 4. Database ER Diagram

```mermaid
erDiagram
    conversations {
        uuid id PK
        varchar title
        timestamp created_at
        timestamp updated_at
    }

    messages {
        uuid id PK
        uuid conversation_id FK
        varchar role "user | assistant"
        text content
        varchar file_name "nullable"
        jsonb attachments "nullable"
        timestamp created_at
    }

    embeddings {
        serial id PK
        varchar file_name
        varchar file_type
        varchar file_path
        integer chunk_index
        text chunk_text "nullable"
        text content_summary "nullable"
        vector_3072 embedding "3072-dimension vector"
        jsonb metadata "nullable"
        timestamp created_at
    }

    conversations ||--o{ messages : "has many"
```

### Index Structure

| Table | Index | Type | Target Column |
|---|---|---|---|
| `embeddings` | `embedding_idx` | IVFFlat (cosine) | `embedding` |
| `embeddings` | `file_name_idx` | B-tree | `file_name` |
| `messages` | `conv_created_idx` | B-tree (composite) | `conversation_id, created_at` |

---

## 5. API Route Structure

```mermaid
graph LR
    subgraph AppRouter["Next.js App Router (/api)"]
        subgraph Chat["Chat"]
            ChatRoute["POST /api/chat<br/>RAG Streaming Response"]
        end

        subgraph Embed["Embedding"]
            EmbedRoute["POST /api/embed<br/>Single File Embedding"]
        end

        subgraph Pipeline["Pipeline"]
            PipeStart["POST /api/pipeline/start<br/>Start Batch"]
            PipeUpload["POST /api/pipeline/upload<br/>Browser Upload"]
            PipeStatus["GET /api/pipeline/status<br/>Progress Query"]
        end

        subgraph Conversations["Conversation Management"]
            ConvGet["GET /api/conversations<br/>List Query"]
            ConvPost["POST /api/conversations<br/>Create New Conversation"]
            ConvDelete["DELETE /api/conversations<br/>Delete Conversation"]
        end

        subgraph Files["Files"]
            FilesProxy["GET /api/files/[...path]<br/>GCS Proxy"]
        end
    end

    ChatRoute -->|"depends on"| RAGLib["rag.ts"]
    ChatRoute -->|"depends on"| GeminiLib["gemini.ts"]
    EmbedRoute -->|"depends on"| EmbedLib["embedding.ts"]
    PipeStart -->|"depends on"| EmbedLib
    PipeStart -->|"depends on"| StateLib["pipeline-state.ts"]
    PipeUpload -->|"depends on"| EmbedLib
    FilesProxy -->|"depends on"| GCSLib["gcs.ts"]
    ConvGet -->|"depends on"| DBLib["db.ts"]
```

---

## 6. Component Hierarchy Diagram

```mermaid
graph TD
    subgraph Pages["Page Components"]
        ChatPage["chat/page.tsx<br/>Chat Page"]
        AdminPage["admin/pipeline/page.tsx<br/>Admin Page"]
    end

    subgraph ChatComponents["Chat Components"]
        ChatSidebar["ChatSidebar<br/>Conversation List"]
        ChatWindow["ChatWindow<br/>Message Display"]
        ChatInput["ChatInput<br/>Input + File Upload"]
    end

    subgraph AdminComponents["Admin Components"]
        PipelineDashboard["PipelineDashboard<br/>Pipeline Management"]
    end

    subgraph UILibrary["UI Library (shadcn/ui)"]
        Button["Button"]
        Input["Input"]
        ScrollArea["ScrollArea"]
        Card["Card"]
        Progress["Progress"]
    end

    subgraph Rendering["Rendering"]
        ReactMarkdown2["ReactMarkdown<br/>Markdown Rendering"]
        LucideIcons["Lucide Icons<br/>Icons"]
    end

    ChatPage --> ChatSidebar
    ChatPage --> ChatWindow
    ChatPage --> ChatInput
    AdminPage --> PipelineDashboard

    ChatSidebar --> UILibrary
    ChatWindow --> UILibrary
    ChatWindow --> ReactMarkdown2
    ChatWindow --> LucideIcons
    ChatInput --> UILibrary
    PipelineDashboard --> UILibrary

    ChatSidebar -->|"GET /api/conversations"| API1["API"]
    ChatInput -->|"POST /api/chat"| API2["API"]
    ChatInput -->|"POST /api/embed"| API3["API"]
    ChatWindow -->|"GET /api/files/..."| API4["API"]
    PipelineDashboard -->|"POST /api/pipeline/*"| API5["API"]
```

---

## 7. Key Sequence Diagrams

### 7.1 Conversation Creation and First Message

```mermaid
sequenceDiagram
    participant User as User
    participant Sidebar as ChatSidebar
    participant Input as ChatInput
    participant Window as ChatWindow
    participant ConvAPI as /api/conversations
    participant ChatAPI as /api/chat
    participant DB as PostgreSQL

    User->>Sidebar: Click "New Conversation"
    Sidebar->>ConvAPI: POST {title: "New Conversation"}
    ConvAPI->>DB: INSERT conversations
    DB-->>ConvAPI: {id, title}
    ConvAPI-->>Sidebar: 201 {id, title}
    Sidebar->>Sidebar: Refresh conversation list, switch active conversation

    User->>Input: Enter message + send
    Input->>ChatAPI: POST {message, conversationId}
    ChatAPI-->>Window: ReadableStream (attachments + text)

    Window->>Window: Parse attachments (__ATTACHMENTS__...__)
    Window->>Window: Render streaming text (ReactMarkdown)

    ChatAPI->>DB: INSERT messages (user, assistant) [async]
```

### 7.2 File Upload and Embedding

```mermaid
sequenceDiagram
    participant User as User
    participant Input as ChatInput
    participant EmbedAPI as /api/embed
    participant Parser as file-parser.ts
    participant Embed as embedding.ts
    participant GCS as Google Cloud Storage
    participant Gemini as Gemini API
    participant DB as PostgreSQL

    User->>Input: Drag and drop file
    Input->>Input: File size validation (100MB limit)
    Input->>EmbedAPI: POST FormData {file}

    EmbedAPI->>Parser: Classify file (MIME, type)
    Parser->>Parser: Gemini API format validation
    Parser-->>EmbedAPI: {fileType, mimeType, isValid}

    EmbedAPI->>Embed: Process file embedding

    Embed->>GCS: Upload file
    GCS-->>Embed: GCS path

    alt Text file
        Embed->>Embed: Chunking (2000 chars / 200 char overlap)
        loop Each chunk
            Embed->>Gemini: embedContent(text)
            Gemini-->>Embed: vector[3072]
            Embed->>DB: INSERT INTO embeddings
        end
    else PDF
        Embed->>Embed: pdf-lib 6-page split
        loop Each PDF chunk
            Embed->>Gemini: embedContent(pdf_bytes)
            Embed->>Gemini: generateContent(summary request)
            Gemini-->>Embed: vector + summary
            Embed->>DB: INSERT INTO embeddings
        end
    else Media
        Embed->>Gemini: embedContent(base64)
        Embed->>Gemini: generateContent(summary request)
        Gemini-->>Embed: vector + summary
        Embed->>DB: INSERT INTO embeddings
    end

    EmbedAPI-->>Input: 200 {fileName, chunks, fileType}
    Input->>Input: Display success notification
```

### 7.3 GCS File Proxy Request

```mermaid
sequenceDiagram
    participant Browser as Browser
    participant Proxy as /api/files/[...path]
    participant GCSLib as gcs.ts
    participant GCS as Google Cloud Storage

    Browser->>Proxy: GET /api/files/bucket/path/image.png
    Proxy->>Proxy: Extract path parameters
    Proxy->>Proxy: Normalize path (prevent traversal)
    Proxy->>Proxy: Validate ALLOWED_GCS_PREFIX

    alt Valid path
        Proxy->>GCSLib: download(normalizedPath)
        GCSLib->>GCS: getObject
        GCS-->>GCSLib: File data + Content-Type
        GCSLib-->>Proxy: Buffer + metadata
        Proxy-->>Browser: 200 (file data, Content-Type header)
    else Path traversal detected
        Proxy-->>Browser: 403 Forbidden
    end
```

---

## 8. Security Architecture

```mermaid
graph TD
    subgraph Input["Input Validation"]
        UUID["conversationId<br/>UUID Format Validation"]
        MsgLen["Message Length Limit<br/>Max 10,000 chars"]
        FileSize["File Size Limit<br/>Max 100MB"]
        MIMECheck["MIME Type Validation<br/>Process Allowed Formats Only"]
    end

    subgraph PathSecurity["Path Security"]
        PathNorm["Path Normalization<br/>path.normalize()"]
        PathTraversal["Path Traversal Prevention<br/>Block .. Patterns"]
        GCSPrefix["GCS Prefix Validation<br/>ALLOWED_GCS_PREFIX"]
        LocalDir["Local Directory Restriction<br/>Allow only ./data, ./uploads"]
    end

    subgraph Auth["Authentication"]
        GeminiKey["GEMINI_API_KEY<br/>Server-side Only"]
        GCSCredentials["GOOGLE_APPLICATION_CREDENTIALS<br/>Service Account"]
    end

    Request["Client Request"] --> Input
    Input --> PathSecurity
    PathSecurity --> Processing["Request Processing"]
    Auth --> Processing
```
