# 아키텍처 문서

Gemini RAG 시스템의 전체 아키텍처를 설명합니다. 모든 다이어그램은 Mermaid 문법으로 작성되었습니다.

---

## 1. 시스템 개요

```mermaid
graph TB
    subgraph Client["클라이언트 (브라우저)"]
        ChatUI["채팅 UI<br/>/chat"]
        AdminUI["파이프라인 관리 UI<br/>/admin/pipeline"]
    end

    subgraph NextJS["Next.js 15 App Router"]
        subgraph API["API 라우트"]
            ChatAPI["/api/chat<br/>RAG 질의 + 스트리밍"]
            EmbedAPI["/api/embed<br/>단일 파일 임베딩"]
            PipelineAPI["/api/pipeline/*<br/>배치 파이프라인"]
            ConvAPI["/api/conversations<br/>대화 CRUD"]
            FilesAPI["/api/files/[...path]<br/>GCS 프록시"]
        end

        subgraph Lib["핵심 라이브러리 (src/lib/)"]
            RAG["rag.ts<br/>RAG 파이프라인"]
            Embedding["embedding.ts<br/>임베딩 로직"]
            GeminiClient["gemini.ts<br/>Gemini API 클라이언트"]
            FileParser["file-parser.ts<br/>파일 분류/파싱"]
            GCSLib["gcs.ts<br/>GCS 클라이언트"]
            DB["db.ts<br/>Drizzle ORM"]
            PipelineState["pipeline-state.ts<br/>상태 관리"]
        end
    end

    subgraph External["외부 서비스"]
        Gemini["Google Gemini API<br/>임베딩 + 채팅 + 번역"]
        GCS["Google Cloud Storage<br/>파일 저장소"]
        PG["PostgreSQL + pgvector<br/>벡터 DB"]
    end

    ChatUI -->|"메시지 전송"| ChatAPI
    ChatUI -->|"대화 관리"| ConvAPI
    ChatUI -->|"파일 조회"| FilesAPI
    AdminUI -->|"파이프라인 제어"| PipelineAPI

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

## 2. 기술 스택 레이어

```mermaid
graph TB
    subgraph Presentation["프레젠테이션 레이어"]
        React["React 컴포넌트"]
        Tailwind["Tailwind CSS"]
        ShadcnUI["shadcn/ui"]
        Lucide["Lucide 아이콘"]
        ReactMD["ReactMarkdown"]
    end

    subgraph Application["애플리케이션 레이어"]
        NextApp["Next.js 15 App Router"]
        VercelAI["Vercel AI SDK<br/>스트리밍"]
        APIRoutes["API Route Handlers"]
    end

    subgraph Domain["도메인 레이어"]
        RAGPipeline["RAG 파이프라인<br/>(rag.ts)"]
        EmbeddingEngine["임베딩 엔진<br/>(embedding.ts)"]
        FileProcessor["파일 프로세서<br/>(file-parser.ts)"]
        GeminiSDK["Gemini 클라이언트<br/>(gemini.ts)"]
    end

    subgraph Infrastructure["인프라 레이어"]
        DrizzleORM["Drizzle ORM<br/>(db.ts, schema.ts)"]
        GCSClient["GCS 클라이언트<br/>(gcs.ts)"]
        PipelineMgr["파이프라인 상태<br/>(pipeline-state.ts)"]
        EnvConfig["환경변수 검증<br/>(env.ts)"]
    end

    subgraph External["외부 서비스"]
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

## 3. 데이터 플로우

### 3.1 배치 임베딩 파이프라인

```mermaid
sequenceDiagram
    participant User as 사용자/관리자
    participant UI as PipelineDashboard
    participant API as /api/pipeline/start
    participant State as pipeline-state.ts
    participant Embed as embedding.ts
    participant Parser as file-parser.ts
    participant Gemini as Gemini API
    participant GCS as Google Cloud Storage
    participant DB as PostgreSQL

    User->>UI: 디렉토리 경로 입력
    UI->>API: POST {source, path}
    API->>State: 파이프라인 생성 (pipelineId)
    API-->>UI: 202 Accepted {pipelineId}

    loop 파일 목록 순회 (3개 병렬)
        API->>Parser: 파일 분류 (MIME 타입)
        Parser-->>API: fileType, mimeType

        alt 텍스트 파일
            API->>Embed: 텍스트 청킹 (2000자, 200자 오버랩)
            Embed->>GCS: 원본 파일 업로드
            loop 각 청크
                Embed->>Gemini: 텍스트 임베딩 요청
                Gemini-->>Embed: 3072차원 벡터
                Embed->>DB: INSERT embeddings
            end
        else PDF 파일
            API->>Embed: pdf-lib로 6페이지 단위 분할
            Embed->>GCS: 원본 파일 업로드
            loop 각 PDF 청크
                Embed->>Gemini: 멀티모달 임베딩 (PDF)
                Gemini-->>Embed: 3072차원 벡터
                Embed->>Gemini: 텍스트 추출 + AI 요약
                Gemini-->>Embed: 텍스트 + 요약
                Embed->>DB: INSERT embeddings
            end
        else 이미지/오디오/비디오
            Embed->>GCS: 원본 파일 업로드
            Embed->>Gemini: base64 멀티모달 임베딩
            Gemini-->>Embed: 3072차원 벡터
            Embed->>Gemini: AI 콘텐츠 요약
            Gemini-->>Embed: 요약 텍스트
            Embed->>DB: INSERT embeddings
        end

        API->>State: 진행률 업데이트
    end

    Note over API,State: 실패 시 최대 3회 재시도

    loop 진행률 폴링
        UI->>API: GET /api/pipeline/status?id={pipelineId}
        API->>State: 현재 상태 조회
        State-->>API: {total, completed, failed, status}
        API-->>UI: 진행률 JSON
    end
```

### 3.2 채팅 RAG 질의 플로우

```mermaid
sequenceDiagram
    participant User as 사용자
    participant UI as ChatWindow
    participant API as /api/chat
    participant RAG as rag.ts
    participant Gemini as Gemini API
    participant DB as PostgreSQL
    participant GCS as GCS 프록시

    User->>UI: 메시지 입력
    UI->>API: POST {message, conversationId}
    API->>API: UUID 검증 + 메시지 길이 검증 (10000자)

    API->>RAG: 유사 문서 검색 (query)

    par 벡터 검색
        RAG->>Gemini: 쿼리 임베딩
        Gemini-->>RAG: 쿼리 벡터
        RAG->>DB: pgvector 코사인 유사도 검색
        DB-->>RAG: 유사 문서 목록
    and 이중 언어 검색 (비영어 쿼리)
        RAG->>Gemini: 영어로 번역
        Gemini-->>RAG: 영어 쿼리
        RAG->>Gemini: 번역된 쿼리 임베딩
        Gemini-->>RAG: 번역 쿼리 벡터
        RAG->>DB: pgvector 코사인 유사도 검색
        DB-->>RAG: 추가 유사 문서
    and 파일명 검색 (파일명 패턴 포함 시)
        RAG->>DB: 파일명 LIKE 검색
        DB-->>RAG: 파일명 매치 문서
    end

    RAG->>RAG: 결과 병합 + ID 중복 제거 + 유사도 정렬
    RAG->>RAG: MIN_SIMILARITY(0.3) 필터 + 상위 K개 선택
    RAG-->>API: 검색 결과 (컨텍스트 + 첨부파일)

    API->>API: RAG 프롬프트 구성

    API-->>UI: ReadableStream 시작
    Note over API,UI: __ATTACHMENTS__...json...__END_ATTACHMENTS__

    API->>Gemini: 스트리밍 생성 요청
    loop 스트림 청크
        Gemini-->>API: 텍스트 청크
        API-->>UI: 스트림 전송
    end

    UI->>GCS: 첨부 이미지 로드 (/api/files/...)

    API->>DB: 비동기 메시지 저장 (user + assistant)
```

### 3.3 단일 파일 임베딩 플로우

```mermaid
flowchart TD
    A["POST /api/embed<br/>파일 업로드"] --> B{"파일 분류<br/>(file-parser.ts)"}

    B -->|텍스트| C["텍스트 청킹<br/>2000자 / 200자 오버랩"]
    B -->|PDF| D["pdf-lib<br/>6페이지 단위 분할"]
    B -->|이미지/오디오/비디오| E["base64 인코딩<br/>포맷 검증"]

    C --> F["GCS 업로드"]
    D --> F
    E --> F

    F --> G{"파일 타입별 처리"}

    G -->|텍스트 청크| H["Gemini 텍스트 임베딩<br/>(각 청크)"]
    G -->|PDF 청크| I["Gemini 멀티모달 임베딩<br/>+ 텍스트 추출 + AI 요약"]
    G -->|미디어 파일| J["Gemini 멀티모달 임베딩<br/>+ AI 콘텐츠 요약"]

    H --> K["PostgreSQL 저장<br/>(embeddings 테이블)"]
    I --> K
    J --> K

    K --> L["200 OK<br/>{fileName, chunks, fileType}"]
```

---

## 4. 데이터베이스 ER 다이어그램

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
        vector_3072 embedding "3072차원 벡터"
        jsonb metadata "nullable"
        timestamp created_at
    }

    conversations ||--o{ messages : "has many"
```

### 인덱스 구조

| 테이블 | 인덱스 | 타입 | 대상 컬럼 |
|---|---|---|---|
| `embeddings` | `embedding_idx` | IVFFlat (코사인) | `embedding` |
| `embeddings` | `file_name_idx` | B-tree | `file_name` |
| `messages` | `conv_created_idx` | B-tree (복합) | `conversation_id, created_at` |

---

## 5. API 라우트 구조

```mermaid
graph LR
    subgraph AppRouter["Next.js App Router (/api)"]
        subgraph Chat["채팅"]
            ChatRoute["POST /api/chat<br/>RAG 스트리밍 응답"]
        end

        subgraph Embed["임베딩"]
            EmbedRoute["POST /api/embed<br/>단일 파일 임베딩"]
        end

        subgraph Pipeline["파이프라인"]
            PipeStart["POST /api/pipeline/start<br/>배치 시작"]
            PipeUpload["POST /api/pipeline/upload<br/>브라우저 업로드"]
            PipeStatus["GET /api/pipeline/status<br/>진행률 조회"]
        end

        subgraph Conversations["대화 관리"]
            ConvGet["GET /api/conversations<br/>목록 조회"]
            ConvPost["POST /api/conversations<br/>새 대화 생성"]
            ConvDelete["DELETE /api/conversations<br/>대화 삭제"]
        end

        subgraph Files["파일"]
            FilesProxy["GET /api/files/[...path]<br/>GCS 프록시"]
        end
    end

    ChatRoute -->|"의존"| RAGLib["rag.ts"]
    ChatRoute -->|"의존"| GeminiLib["gemini.ts"]
    EmbedRoute -->|"의존"| EmbedLib["embedding.ts"]
    PipeStart -->|"의존"| EmbedLib
    PipeStart -->|"의존"| StateLib["pipeline-state.ts"]
    PipeUpload -->|"의존"| EmbedLib
    FilesProxy -->|"의존"| GCSLib["gcs.ts"]
    ConvGet -->|"의존"| DBLib["db.ts"]
```

---

## 6. 컴포넌트 계층 다이어그램

```mermaid
graph TD
    subgraph Pages["페이지 컴포넌트"]
        ChatPage["chat/page.tsx<br/>채팅 페이지"]
        AdminPage["admin/pipeline/page.tsx<br/>관리자 페이지"]
    end

    subgraph ChatComponents["채팅 컴포넌트"]
        ChatSidebar["ChatSidebar<br/>대화 목록"]
        ChatWindow["ChatWindow<br/>메시지 표시"]
        ChatInput["ChatInput<br/>입력 + 파일 업로드"]
    end

    subgraph AdminComponents["관리 컴포넌트"]
        PipelineDashboard["PipelineDashboard<br/>파이프라인 관리"]
    end

    subgraph UILibrary["UI 라이브러리 (shadcn/ui)"]
        Button["Button"]
        Input["Input"]
        ScrollArea["ScrollArea"]
        Card["Card"]
        Progress["Progress"]
    end

    subgraph Rendering["렌더링"]
        ReactMarkdown2["ReactMarkdown<br/>마크다운 렌더링"]
        LucideIcons["Lucide Icons<br/>아이콘"]
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

## 7. 주요 시퀀스 다이어그램

### 7.1 대화 생성 및 첫 메시지 전송

```mermaid
sequenceDiagram
    participant User as 사용자
    participant Sidebar as ChatSidebar
    participant Input as ChatInput
    participant Window as ChatWindow
    participant ConvAPI as /api/conversations
    participant ChatAPI as /api/chat
    participant DB as PostgreSQL

    User->>Sidebar: "새 대화" 클릭
    Sidebar->>ConvAPI: POST {title: "새 대화"}
    ConvAPI->>DB: INSERT conversations
    DB-->>ConvAPI: {id, title}
    ConvAPI-->>Sidebar: 201 {id, title}
    Sidebar->>Sidebar: 대화 목록 갱신, 활성 대화 전환

    User->>Input: 메시지 입력 + 전송
    Input->>ChatAPI: POST {message, conversationId}
    ChatAPI-->>Window: ReadableStream (첨부파일 + 텍스트)

    Window->>Window: 첨부파일 파싱 (__ATTACHMENTS__...__)
    Window->>Window: 스트리밍 텍스트 렌더링 (ReactMarkdown)

    ChatAPI->>DB: INSERT messages (user, assistant) [비동기]
```

### 7.2 파일 업로드 후 임베딩

```mermaid
sequenceDiagram
    participant User as 사용자
    participant Input as ChatInput
    participant EmbedAPI as /api/embed
    participant Parser as file-parser.ts
    participant Embed as embedding.ts
    participant GCS as Google Cloud Storage
    participant Gemini as Gemini API
    participant DB as PostgreSQL

    User->>Input: 파일 드래그 앤 드롭
    Input->>Input: 파일 크기 검증 (100MB 제한)
    Input->>EmbedAPI: POST FormData {file}

    EmbedAPI->>Parser: 파일 분류 (MIME, 타입)
    Parser->>Parser: Gemini API 포맷 검증
    Parser-->>EmbedAPI: {fileType, mimeType, isValid}

    EmbedAPI->>Embed: 파일 임베딩 처리

    Embed->>GCS: 파일 업로드
    GCS-->>Embed: GCS 경로

    alt 텍스트 파일
        Embed->>Embed: 청킹 (2000자/200자 오버랩)
        loop 각 청크
            Embed->>Gemini: embedContent(text)
            Gemini-->>Embed: vector[3072]
            Embed->>DB: INSERT INTO embeddings
        end
    else PDF
        Embed->>Embed: pdf-lib 6페이지 분할
        loop 각 PDF 청크
            Embed->>Gemini: embedContent(pdf_bytes)
            Embed->>Gemini: generateContent(요약 요청)
            Gemini-->>Embed: vector + summary
            Embed->>DB: INSERT INTO embeddings
        end
    else 미디어
        Embed->>Gemini: embedContent(base64)
        Embed->>Gemini: generateContent(요약 요청)
        Gemini-->>Embed: vector + summary
        Embed->>DB: INSERT INTO embeddings
    end

    EmbedAPI-->>Input: 200 {fileName, chunks, fileType}
    Input->>Input: 성공 알림 표시
```

### 7.3 GCS 파일 프록시 요청

```mermaid
sequenceDiagram
    participant Browser as 브라우저
    participant Proxy as /api/files/[...path]
    participant GCSLib as gcs.ts
    participant GCS as Google Cloud Storage

    Browser->>Proxy: GET /api/files/bucket/path/image.png
    Proxy->>Proxy: 경로 파라미터 추출
    Proxy->>Proxy: 경로 정규화 (순회 방지)
    Proxy->>Proxy: ALLOWED_GCS_PREFIX 검증

    alt 경로 유효
        Proxy->>GCSLib: download(normalizedPath)
        GCSLib->>GCS: getObject
        GCS-->>GCSLib: 파일 데이터 + Content-Type
        GCSLib-->>Proxy: Buffer + metadata
        Proxy-->>Browser: 200 (파일 데이터, Content-Type 헤더)
    else 경로 순회 감지
        Proxy-->>Browser: 403 Forbidden
    end
```

---

## 8. 보안 아키텍처

```mermaid
graph TD
    subgraph Input["입력 검증"]
        UUID["conversationId<br/>UUID 포맷 검증"]
        MsgLen["메시지 길이 제한<br/>최대 10,000자"]
        FileSize["파일 크기 제한<br/>최대 100MB"]
        MIMECheck["MIME 타입 검증<br/>허용 포맷만 처리"]
    end

    subgraph PathSecurity["경로 보안"]
        PathNorm["경로 정규화<br/>path.normalize()"]
        PathTraversal["경로 순회 방지<br/>.. 패턴 차단"]
        GCSPrefix["GCS 접두사 검증<br/>ALLOWED_GCS_PREFIX"]
        LocalDir["로컬 디렉토리 제한<br/>./data, ./uploads만 허용"]
    end

    subgraph Auth["인증"]
        GeminiKey["GEMINI_API_KEY<br/>서버 사이드 전용"]
        GCSCredentials["GOOGLE_APPLICATION_CREDENTIALS<br/>서비스 계정"]
    end

    Request["클라이언트 요청"] --> Input
    Input --> PathSecurity
    PathSecurity --> Processing["요청 처리"]
    Auth --> Processing
```
