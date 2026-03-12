# Gemini RAG System Design

## Overview

Gemini 모델 기반 AI RAG(Retrieval-Augmented Generation) 시스템. PostgreSQL pgvector를 벡터 DB로 사용하고, 멀티모달 파일(텍스트, PDF, 이미지, 오디오, 비디오)에 대한 embedding과 유사도 검색을 지원한다.

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프레임워크 | Next.js 15 (App Router), TypeScript |
| Embedding 모델 | gemini-embedding-2-preview (3072 차원) |
| LLM | gemini-3.1-pro-preview |
| DB | PostgreSQL + pgvector (기존 인스턴스) |
| ORM | Drizzle ORM |
| 파일 저장소 | Google Cloud Storage |
| AI 스트리밍 | Vercel AI SDK |
| PDF 파싱 | pdf-parse |
| UI | Tailwind CSS + shadcn/ui |
| CLI 실행 | tsx |

## 프로젝트 구조

```
gemini-embedding-2-test/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── chat/
│   │   │   └── page.tsx              # 채팅 UI (사이드바 + 대화창)
│   │   ├── admin/
│   │   │   └── pipeline/
│   │   │       └── page.tsx          # 배치 파이프라인 관리 UI
│   │   └── api/
│   │       ├── chat/
│   │       │   └── route.ts          # RAG 질의 (스트리밍 응답)
│   │       ├── embed/
│   │       │   └── route.ts          # 단일 파일 embedding
│   │       ├── pipeline/
│   │       │   ├── start/route.ts    # 배치 파이프라인 시작
│   │       │   └── status/route.ts   # 진행률 조회
│   │       └── conversations/
│   │           └── route.ts          # 대화 목록 CRUD
│   ├── lib/
│   │   ├── gemini.ts                 # Gemini API 클라이언트
│   │   ├── db.ts                     # PostgreSQL 연결
│   │   ├── embedding.ts              # embedding 로직
│   │   ├── rag.ts                    # RAG 파이프라인
│   │   └── file-parser.ts            # 멀티모달 파일 파싱
│   ├── components/
│   │   ├── ChatSidebar.tsx
│   │   ├── ChatWindow.tsx
│   │   ├── ChatInput.tsx
│   │   ├── FileUpload.tsx
│   │   └── PipelineDashboard.tsx
│   └── scripts/
│       └── pipeline.ts               # CLI 배치 파이프라인
├── .env.local
├── package.json
├── tsconfig.json
└── next.config.ts
```

## 데이터베이스 스키마

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_name VARCHAR(500) NOT NULL,
    file_type VARCHAR(50) NOT NULL,
    file_path VARCHAR(1000) NOT NULL,        -- GCS URL
    chunk_index INTEGER NOT NULL DEFAULT 0,
    chunk_text TEXT,
    content_summary TEXT,
    embedding vector(3072) NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_embeddings_vector
    ON embeddings USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

CREATE INDEX idx_embeddings_file_name ON embeddings (file_name);

CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(200) NOT NULL DEFAULT '새 대화',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    file_name VARCHAR(500),
    attachments JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages (conversation_id, created_at);
```

## 데이터 플로우

### 배치 Embedding 파이프라인

1. 로컬 폴더 또는 GCS 버킷에서 파일 스캔
2. 파일 형식별 파싱 및 청킹 (텍스트/PDF: 텍스트 추출 후 청크 분할, 멀티모달: 원본 바이너리 유지)
3. GCS에 원본 파일 업로드, 공개 URL 획득
4. Gemini Embedding 2 Preview로 3072 차원 벡터 생성
5. 멀티모달 파일은 Gemini 3.1 Pro로 content_summary 생성
6. PostgreSQL embeddings 테이블에 저장

- 동시 처리: 5개 파일 병렬
- 실패 시 3회 재시도 후 스킵
- 진행률: Admin UI에서 SSE로 실시간 업데이트

### 채팅 RAG 질의

1. 사용자 질의를 Gemini Embedding으로 벡터화 (task_type: RETRIEVAL_QUERY)
2. pgvector cosine similarity로 상위 K개 검색
3. 검색 결과(content_summary, chunk_text, GCS URL)를 프롬프트에 포함
4. Gemini 3.1 Pro로 스트리밍 응답 생성
5. 채팅 UI에 텍스트 + 이미지 썸네일 렌더링

### 단일 파일 Embedding (채팅)

1. 사용자가 파일 업로드 + "embedding 해줘" 요청
2. GCS에 파일 업로드
3. Gemini Embedding으로 벡터화
4. 멀티모달이면 Gemini 3.1 Pro로 content_summary 생성
5. PostgreSQL에 저장
6. 완료 메시지 응답

## 채팅 UI

- 사이드바: 대화 목록, 새 대화 생성/삭제
- 채팅 영역: 스트리밍 텍스트 응답 + 검색된 이미지 썸네일 (GCS URL)
- 입력창: 텍스트 입력 + 파일 업로드 버튼
- "embedding 해줘" 명령 감지 시 단일 파일 embedding 실행

## Admin 파이프라인 UI

- 소스 경로 입력 (로컬 폴더 또는 GCS 버킷)
- 파이프라인 시작/중지 버튼
- 실시간 진행률 (프로그레스 바, 성공/실패/대기 카운트)
- 최근 처리 파일 로그

## CLI 사용법

```bash
npx tsx src/scripts/pipeline.ts ./data/products
npx tsx src/scripts/pipeline.ts gs://my-bucket/products
```

## 환경변수

```
GEMINI_API_KEY=
DATABASE_URL=postgresql://user:pass@host:5432/dbname
GCS_BUCKET_NAME=
GCS_PROJECT_ID=
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
```

## 인증

없음 (개인용/내부용)
