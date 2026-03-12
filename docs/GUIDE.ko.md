# Gemini RAG System - 상세 가이드 문서

> Gemini 모델 기반 멀티모달 RAG(Retrieval-Augmented Generation) 시스템의 코드베이스 분석 및 사용 가이드

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [기술 스택](#2-기술-스택)
3. [프로젝트 구조](#3-프로젝트-구조)
4. [환경 설정 및 설치](#4-환경-설정-및-설치)
5. [핵심 라이브러리 모듈 (src/lib/)](#5-핵심-라이브러리-모듈-srclib)
6. [API 라우트 (src/app/api/)](#6-api-라우트-srcappapi)
7. [프론트엔드 컴포넌트](#7-프론트엔드-컴포넌트)
8. [데이터베이스 스키마](#8-데이터베이스-스키마)
9. [데이터 흐름 아키텍처](#9-데이터-흐름-아키텍처)
10. [CLI 스크립트](#10-cli-스크립트)
11. [설정 파일](#11-설정-파일)
12. [핵심 설정값 레퍼런스](#12-핵심-설정값-레퍼런스)
13. [보안 고려사항](#13-보안-고려사항)

---

## 1. 프로젝트 개요

이 프로젝트는 Google Gemini AI 모델을 활용한 **멀티모달 RAG 시스템**입니다. 다양한 형식의 파일(텍스트, PDF, 이미지, 오디오, 비디오)을 벡터 임베딩으로 변환하여 PostgreSQL pgvector에 저장하고, 사용자 질의에 대해 의미 기반 검색 + AI 응답 생성을 수행합니다.

### 주요 기능

- **배치 Embedding 파이프라인**: 폴더 내 파일을 일괄 임베딩 처리 (CLI + Web UI)
- **RAG 채팅**: 벡터 검색 기반 AI 대화 (스트리밍 응답)
- **단일 파일 Embedding**: 채팅 중 파일 업로드로 즉시 임베딩
- **멀티모달 지원**: 텍스트/PDF는 청킹, 이미지/오디오/비디오는 AI 요약 생성

---

## 2. 기술 스택

| 영역 | 기술 | 버전 |
|------|------|------|
| **프레임워크** | Next.js (App Router) | 16.1.6 |
| **언어** | TypeScript | 5.x |
| **Embedding 모델** | gemini-embedding-2-preview | 3072 차원 |
| **LLM** | gemini-3.1-pro-preview | - |
| **DB** | PostgreSQL + pgvector | - |
| **ORM** | Drizzle ORM | 0.45.1 |
| **파일 저장소** | Google Cloud Storage | - |
| **AI 스트리밍** | Vercel AI SDK (@ai-sdk/google) | 3.x / 6.x |
| **PDF 파싱** | pdf-parse | 2.4.5 |
| **UI** | Tailwind CSS v4 + shadcn/ui | 4.x / 4.0.5 |
| **패키지 매니저** | pnpm | - |

---

## 3. 프로젝트 구조

```
gemini-embedding-2-test/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── layout.tsx                # 루트 레이아웃 (Inter 폰트, 메타데이터)
│   │   ├── page.tsx                  # 메인 페이지 (/chat으로 리다이렉트)
│   │   ├── globals.css               # 글로벌 CSS (Tailwind, 색상 변수)
│   │   ├── chat/
│   │   │   └── page.tsx              # 채팅 UI (사이드바 + 대화창 + 입력)
│   │   ├── admin/
│   │   │   └── pipeline/
│   │   │       └── page.tsx          # 배치 파이프라인 관리 UI
│   │   └── api/
│   │       ├── chat/route.ts         # RAG 질의 (스트리밍 응답)
│   │       ├── embed/route.ts        # 단일 파일 embedding
│   │       ├── conversations/route.ts # 대화 목록 CRUD
│   │       ├── pipeline/
│   │       │   ├── start/route.ts    # 배치 파이프라인 시작
│   │       │   └── status/route.ts   # 진행률 조회
│   │       └── files/[...path]/route.ts  # GCS 파일 프록시
│   │
│   ├── lib/                          # 공유 라이브러리
│   │   ├── env.ts                    # 환경변수 중앙 관리
│   │   ├── gemini.ts                 # Gemini API 클라이언트
│   │   ├── db.ts                     # PostgreSQL 연결 (Drizzle)
│   │   ├── schema.ts                # DB 스키마 정의
│   │   ├── embedding.ts             # 임베딩 생성 로직
│   │   ├── rag.ts                    # RAG 파이프라인 (검색 + 프롬프트)
│   │   ├── file-parser.ts           # 파일 타입 분류, 파싱, 청킹
│   │   ├── gcs.ts                    # GCS 업로드/다운로드
│   │   ├── pipeline-state.ts        # 파이프라인 상태 (인메모리)
│   │   └── utils.ts                  # Tailwind CSS 유틸리티 (cn)
│   │
│   ├── components/                   # React 컴포넌트
│   │   ├── ChatSidebar.tsx           # 대화 목록 사이드바
│   │   ├── ChatWindow.tsx            # 메시지 표시 (Markdown 렌더링)
│   │   ├── ChatInput.tsx             # 메시지 입력 + 파일 첨부
│   │   ├── PipelineDashboard.tsx     # 파이프라인 관리 대시보드
│   │   └── ui/                       # shadcn/ui 기본 컴포넌트
│   │
│   └── scripts/                      # CLI 스크립트
│       ├── pipeline.ts               # 배치 임베딩 CLI
│       └── setup-db.ts               # DB 초기화
│
├── docs/plans/                       # 설계 문서
├── package.json
├── tsconfig.json
├── postcss.config.mjs
├── eslint.config.mjs
└── pnpm-workspace.yaml
```

---

## 4. 환경 설정 및 설치

### 4.1 의존성 설치

```bash
pnpm install
```

### 4.2 환경변수 설정

`.env.local` 파일을 프로젝트 루트에 생성:

```env
# 필수
GEMINI_API_KEY=your-gemini-api-key
DATABASE_URL=postgresql://user:pass@host:5432/dbname
GCS_BUCKET_NAME=your-bucket-name
GCS_PROJECT_ID=your-project-id

# 선택 (기본값 있음)
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
GEMINI_EMBEDDING_MODEL=gemini-embedding-2-preview
GEMINI_CHAT_MODEL=gemini-3.1-pro-preview
```

| 변수명 | 필수 | 기본값 | 설명 |
|--------|------|--------|------|
| `GEMINI_API_KEY` | O | - | Google Gemini API 키 |
| `DATABASE_URL` | O | - | PostgreSQL 연결 문자열 |
| `GCS_BUCKET_NAME` | O | - | GCS 버킷 이름 |
| `GCS_PROJECT_ID` | O | - | Google Cloud 프로젝트 ID |
| `GOOGLE_APPLICATION_CREDENTIALS` | X | undefined | 서비스 계정 JSON 경로 |
| `GEMINI_EMBEDDING_MODEL` | X | `gemini-embedding-2-preview` | 임베딩 모델 |
| `GEMINI_CHAT_MODEL` | X | `gemini-3.1-pro-preview` | 채팅 모델 |

### 4.3 데이터베이스 초기화

```bash
pnpm db:setup
```

이 명령은 다음을 수행합니다:
1. pgvector 확장 설치 (`CREATE EXTENSION IF NOT EXISTS vector`)
2. `embeddings`, `conversations`, `messages` 테이블 생성
3. 벡터 인덱스 (IVFFlat), 파일명 인덱스, 메시지 복합 인덱스 생성

### 4.4 개발 서버 실행

```bash
pnpm dev          # 개발 서버 (http://localhost:3000)
pnpm build        # 프로덕션 빌드
pnpm start        # 프로덕션 서버
pnpm lint         # ESLint 검사
```

---

## 5. 핵심 라이브러리 모듈 (src/lib/)

### 5.1 env.ts - 환경변수 관리

환경변수를 중앙에서 관리하며, 필수 변수는 `requireEnv()`로 런타임 검증합니다.

```typescript
// 사용법
import { env } from '@/lib/env';

env.GEMINI_API_KEY;      // 필수 - 없으면 Error throw
env.GEMINI_CHAT_MODEL;   // 선택 - 기본값 'gemini-3.1-pro-preview'
```

**특징**: Getter 함수를 사용한 lazy evaluation (사용 시점에 검증)

### 5.2 gemini.ts - Gemini API 클라이언트

Google Gemini API와 통신하는 싱글톤 클라이언트입니다.

| Export | 시그니처 | 설명 |
|--------|----------|------|
| `genai` | `GoogleGenAI` 인스턴스 | API 클라이언트 (싱글톤) |
| `generateEmbedding` | `(contents, taskType?) => Promise<number[]>` | 3072차원 벡터 생성 |
| `generateContentSummary` | `(fileData, mimeType) => Promise<string>` | 멀티모달 파일 AI 요약 |

**임베딩 생성**:
```typescript
// 텍스트 임베딩
const vector = await generateEmbedding("검색할 텍스트", 'RETRIEVAL_DOCUMENT');

// 멀티모달 임베딩 (이미지 등)
const vector = await generateEmbedding(
  [{ inlineData: { mimeType: 'image/png', data: base64String } }],
  'RETRIEVAL_DOCUMENT'
);

// 쿼리 임베딩
const queryVector = await generateEmbedding("사용자 질문", 'RETRIEVAL_QUERY');
```

**콘텐츠 요약**: 한국어 프롬프트로 이미지/비디오의 상세 설명을 생성합니다.

### 5.3 db.ts - 데이터베이스 연결

Drizzle ORM + postgres-js 기반 PostgreSQL 연결 싱글톤입니다.

```typescript
import { db } from '@/lib/db';

// 사용 예시
const result = await db.select().from(embeddings).where(...);
```

### 5.4 schema.ts - 데이터베이스 스키마

3개 테이블과 인덱스를 Drizzle ORM으로 정의합니다. (상세: [8. 데이터베이스 스키마](#8-데이터베이스-스키마) 참조)

### 5.5 embedding.ts - 임베딩 생성 로직

파일을 받아서 GCS 업로드 + 벡터 생성 + DB 저장까지 전체 처리합니다.

```typescript
export async function embedFile(fileBuffer: Buffer, fileName: string): Promise<EmbedResult>
```

**처리 분기**:

| 파일 타입 | 처리 방식 | 결과 |
|-----------|-----------|------|
| 텍스트/PDF | 텍스트 추출 → 청킹(2000자, 200 오버랩) → 청크별 임베딩 | N개 레코드 |
| 이미지/오디오/비디오 | Base64 → 멀티모달 임베딩 + AI 요약 | 1개 레코드 |

**의존 모듈**: `gemini.ts`, `gcs.ts`, `file-parser.ts`, `db.ts`, `schema.ts`

### 5.6 rag.ts - RAG 파이프라인

사용자 질의를 벡터화하여 유사 문서를 검색하고, RAG 프롬프트를 구성합니다.

| Export | 시그니처 | 설명 |
|--------|----------|------|
| `searchSimilar` | `(query, topK=5) => Promise<SearchResult[]>` | pgvector 코사인 유사도 검색 |
| `buildRAGPrompt` | `(query, results) => string` | 검색 결과 기반 프롬프트 생성 |

**검색 SQL** (내부):
```sql
SELECT *, 1 - (embedding <=> query_vector::vector) AS similarity
FROM embeddings
ORDER BY embedding <=> query_vector::vector
LIMIT 5
```

### 5.7 file-parser.ts - 파일 파서

| Export | 설명 |
|--------|------|
| `FileCategory` | `'text' \| 'pdf' \| 'image' \| 'audio' \| 'video'` |
| `getFileCategory(fileName)` | 확장자 기반 파일 분류 |
| `getMimeType(fileName)` | 확장자 → MIME 타입 매핑 |
| `extractTextFromPDF(buffer)` | PDF에서 텍스트 추출 (pdf-parse) |
| `chunkText(text, 2000, 200)` | 텍스트를 겹침 있는 청크로 분할 |

**지원 파일 형식**:

| 카테고리 | 확장자 |
|---------|--------|
| text | `.txt`, `.md`, `.csv`, `.json`, `.xml`, `.html` |
| pdf | `.pdf` |
| image | `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.bmp` |
| audio | `.mp3`, `.wav`, `.ogg`, `.flac`, `.m4a` |
| video | `.mp4`, `.webm`, `.avi`, `.mov` |

### 5.8 gcs.ts - Google Cloud Storage

| Export | 설명 |
|--------|------|
| `uploadToGCS(buffer, name, mime)` | GCS 업로드 → `/api/files/{path}` 프록시 URL 반환 |
| `downloadFromGCS(gcsPath)` | GCS 다운로드 (경로 검증 + path traversal 방지) |

**보안**:
- 파일명을 UUID로 무작위화
- `uploads/` 프리픽스로 접근 범위 제한
- `..` 포함 경로 차단

### 5.9 pipeline-state.ts - 파이프라인 상태

인메모리 상태 저장소로 파이프라인 진행률을 관리합니다.

| Export | 설명 |
|--------|------|
| `PipelineStatus` | 상태 인터페이스 (running, total, completed, succeeded, failed, logs) |
| `getStatus()` | 현재 상태 얕은 복사 반환 |
| `resetStatus(total)` | 파이프라인 시작 시 초기화 |
| `updateStatus(partial)` | 부분 상태 업데이트 |
| `addLog(log)` | 로그 추가 (최대 100개 유지, FIFO) |

### 5.10 모듈 의존관계 그래프

```
env.ts (독립)
  ↑
  ├── gemini.ts ──→ embedding.ts (허브)
  ├── db.ts     ──→ embedding.ts
  └── gcs.ts    ──→ embedding.ts
                      ↑
schema.ts ────────────┤
file-parser.ts (독립) ─┘

gemini.ts ──→ rag.ts
db.ts     ──→ rag.ts

pipeline-state.ts (독립) ←── API Routes
utils.ts (독립) ←── UI Components
```

---

## 6. API 라우트 (src/app/api/)

### 6.1 POST /api/chat - RAG 채팅 (스트리밍)

사용자 질의에 대해 벡터 검색 → RAG 프롬프트 → 스트리밍 응답을 생성합니다.

**요청**:
```json
{
  "message": "검색할 질문 (최대 10,000자)",
  "conversationId": "UUID 형식"
}
```

**응답**: `text/plain; charset=utf-8` 스트리밍
```
__ATTACHMENTS__[{type,path,fileName,similarity}]__END_ATTACHMENTS__스트리밍 텍스트...
```

**처리 흐름**:
1. 입력 검증 (message 길이, UUID 형식)
2. `searchSimilar(message, 5)` → 상위 5개 유사 문서 검색
3. 대화 이력 조회 (messages 테이블)
4. 사용자 메시지 DB 저장
5. 미디어 첨부파일 필터링 (유사도 상위 95% 이상)
6. `buildRAGPrompt()` → RAG 프롬프트 구성
7. `streamText()` → Gemini 3.1 Pro 스트리밍 응답
8. 비동기로 어시스턴트 응답 DB 저장 + 대화 제목 자동 생성

**에러**: 400 (입력 오류), 500 (서버 오류)

### 6.2 POST /api/embed - 단일 파일 임베딩

**요청**: `multipart/form-data` (file 필드)

**제약**: 최대 100MB, 지원 확장자만 허용

**응답**:
```json
{ "success": true, "fileName": "doc.pdf", "chunksCreated": 5 }
```

**에러**: 400 (파일 없음/크기 초과/미지원 타입), 500 (임베딩 실패)

### 6.3 GET|POST|DELETE /api/conversations - 대화 CRUD

| 메서드 | 설명 | 요청 | 응답 |
|--------|------|------|------|
| GET | 목록 조회 (updatedAt 최신순) | - | `Conversation[]` |
| POST | 새 대화 생성 | `{ title?: string }` | `Conversation` |
| DELETE | 대화 삭제 (CASCADE) | `?id=UUID` | `{ success: true }` |

### 6.4 POST /api/pipeline/start - 배치 파이프라인 시작

**요청**:
```json
{ "sourcePath": "./data/products" }
```

**보안 검증**:
- `ALLOWED_BASE_DIRS`: `./data`, `./uploads`만 허용
- Path traversal(`../`) 차단

**동작**: 즉시 `{ started: true }` 반환 후 백그라운드 처리
- 5개 파일 동시 처리
- 파일당 최대 3회 재시도
- `pipeline-state.ts`로 실시간 상태 업데이트

### 6.5 GET /api/pipeline/status - 파이프라인 상태 조회

**응답**:
```json
{
  "running": true,
  "total": 150,
  "completed": 45,
  "succeeded": 43,
  "failed": 2,
  "currentFile": "document.pdf",
  "logs": [{ "fileName": "...", "status": "success", "duration": 1234 }]
}
```

### 6.6 GET /api/files/[...path] - GCS 파일 프록시

GCS에 저장된 파일을 프록시하여 제공합니다.

- **경로 검증**: `uploads/` 프리픽스 필수, `..` 차단
- **캐싱**: `Cache-Control: public, max-age=86400` (1일)
- **응답**: 파일 바이너리 + 원본 Content-Type

---

## 7. 프론트엔드 컴포넌트

### 7.1 페이지 구조

| 경로 | 컴포넌트 | 설명 |
|------|----------|------|
| `/` | `page.tsx` | `/chat`으로 리다이렉트 |
| `/chat` | `ChatPage` | 채팅 인터페이스 (사이드바 + 대화창 + 입력) |
| `/admin/pipeline` | `PipelinePage` | 배치 파이프라인 관리 |

### 7.2 ChatSidebar.tsx - 대화 목록 사이드바

```typescript
interface ChatSidebarProps {
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}
```

- **대화 목록**: `GET /api/conversations` (activeId 변경 시 재조회)
- **새 대화**: `onNew()` 콜백
- **대화 삭제**: `DELETE /api/conversations?id=` (group-hover로 삭제 버튼 노출)
- **하단**: Admin Pipeline 링크

### 7.3 ChatWindow.tsx - 메시지 표시

```typescript
interface ChatWindowProps {
  messages: Message[];
  streamingContent?: string;
  streamingAttachments?: Attachment[];
  loading?: boolean;
}
```

- **메시지 렌더링**: User(우측 정렬) / Assistant(좌측, Markdown)
- **마크다운**: `react-markdown` + `remark-gfm` (표, 코드, 링크 지원)
- **이미지 첨부**: `AttachmentGrid` (클릭 시 새 탭, 유사도 표시)
- **로딩**: `ThinkingIndicator` (바운스 점 애니메이션)
- **자동 스크롤**: `bottomRef`로 최신 메시지에 스크롤

### 7.4 ChatInput.tsx - 메시지 입력

```typescript
interface ChatInputProps {
  onSend: (message: string, file?: File) => void;
  disabled?: boolean;
}
```

- **텍스트 입력**: Enter 전송, Shift+Enter 줄바꿈
- **파일 첨부**: Paperclip 버튼 → 숨겨진 file input
- **선택 파일**: Badge 표시 + 삭제 버튼

### 7.5 PipelineDashboard.tsx - 파이프라인 관리

- **소스 경로 입력** + 시작 버튼
- **1초 폴링**: `GET /api/pipeline/status`
- **Progress 바**: 완료/전체 비율
- **통계**: 성공(녹색)/실패(빨간색)/대기 카운트
- **로그**: ScrollArea에 최근 처리 결과 (파일명, 상태, 소요시간)

### 7.6 채팅 페이지 데이터 흐름 (chat/page.tsx)

```
ChatPage (상태 관리)
├── conversationId, messages, streaming, loading
├── createConversation() → POST /api/conversations
├── handleSend(message, file?)
│   ├── 파일 + "embedding" 키워드 → POST /api/embed
│   └── 일반 채팅 → POST /api/chat (스트리밍)
│       └── parseStreamChunk() → attachments + text 분리
│
├── ChatSidebar (onSelect, onNew)
├── ChatWindow (messages, streamingContent)
└── ChatInput (onSend, disabled)
```

### 7.7 디자인 시스템

| 요소 | 값 |
|------|-----|
| Primary 색상 | `#5b5fc7` (보라색) |
| Background | `#f7f8fc` |
| Foreground | `#1a1a2e` |
| 폰트 | Inter (Google Fonts) |
| 사이드바 너비 | `w-72` (288px) |
| 콘텐츠 최대 너비 | `max-w-3xl` |
| 컴포넌트 | shadcn/ui (Button, Input, Card, Badge, Progress, Dialog, ScrollArea) |
| 아이콘 | lucide-react |

---

## 8. 데이터베이스 스키마

### 8.1 테이블 관계도

```
conversations (1)
    │
    │ 1:N (CASCADE DELETE)
    ↓
messages (N)
    │
    │ attachments JSONB → 검색 결과 참조
    ↓
embeddings (독립 - 벡터 검색 대상)
```

### 8.2 embeddings 테이블

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| `id` | UUID | PK, 자동생성 | 레코드 ID |
| `file_name` | varchar(500) | NOT NULL | 원본 파일명 |
| `file_type` | varchar(50) | NOT NULL | `text\|pdf\|image\|audio\|video` |
| `file_path` | varchar(1000) | NOT NULL | `/api/files/...` 프록시 URL |
| `chunk_index` | integer | NOT NULL, default 0 | 청크 순서 |
| `chunk_text` | text | nullable | 텍스트 청크 내용 |
| `content_summary` | text | nullable | 멀티모달 AI 요약 |
| `embedding` | vector(3072) | NOT NULL | Gemini 임베딩 벡터 |
| `metadata` | jsonb | default `{}` | `{totalChunks}` 또는 `{mimeType}` |
| `created_at` | timestamp | default NOW() | 생성 시간 |

**인덱스**:
- `idx_embeddings_vector`: IVFFlat + vector_cosine_ops (벡터 검색)
- `idx_embeddings_file_name`: 파일명 검색

### 8.3 conversations 테이블

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| `id` | UUID | PK | 대화 ID |
| `title` | varchar(200) | NOT NULL, default '새 대화' | 대화 제목 |
| `created_at` | timestamp | default NOW() | 생성 시간 |
| `updated_at` | timestamp | default NOW() | 최종 업데이트 |

### 8.4 messages 테이블

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| `id` | UUID | PK | 메시지 ID |
| `conversation_id` | UUID | FK → conversations(CASCADE) | 소속 대화 |
| `role` | varchar(20) | NOT NULL | `user` 또는 `assistant` |
| `content` | text | NOT NULL | 메시지 본문 |
| `file_name` | varchar(500) | nullable | 참조 파일명 |
| `attachments` | jsonb | default `[]` | `[{type, path, fileName, similarity}]` |
| `created_at` | timestamp | default NOW() | 생성 시간 |

**인덱스**: `idx_messages_conversation` ON (conversation_id, created_at)

---

## 9. 데이터 흐름 아키텍처

### 9.1 시스템 아키텍처 다이어그램

```
┌─────────────────────────────────────────────────┐
│                 사용자 인터페이스                   │
│  ChatSidebar │ ChatWindow │ ChatInput            │
│  PipelineDashboard                               │
└──────────────────────┬──────────────────────────┘
                       │ API 호출
┌──────────────────────┴──────────────────────────┐
│              Next.js API Routes                  │
│  /api/chat  /api/embed  /api/conversations       │
│  /api/pipeline/start|status  /api/files/[...]    │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────┐
│              src/lib/ 공유 로직                    │
│  gemini.ts  rag.ts  embedding.ts                 │
│  gcs.ts  file-parser.ts  db.ts                   │
└──────────┬───────────┬───────────┬──────────────┘
           │           │           │
    ┌──────┴──┐  ┌─────┴────┐ ┌───┴──────────┐
    │ Gemini  │  │   GCS    │ │  PostgreSQL  │
    │  API    │  │ Storage  │ │  + pgvector  │
    └─────────┘  └──────────┘ └──────────────┘
```

### 9.2 배치 Embedding 파이프라인

```
파일 스캔 (로컬 디렉토리)
  ↓
파일 타입 필터링 (getFileCategory)
  ↓
5개씩 병렬 처리 (Promise.allSettled)
  ↓ (각 파일)
GCS 업로드 → 프록시 URL 획득
  ↓
┌─ 텍스트/PDF: 텍스트 추출 → 청킹(2000/200) → 청크별 임베딩
└─ 멀티모달: Base64 → 임베딩 + AI 요약
  ↓
PostgreSQL embeddings 테이블 저장
  ↓
상태 업데이트 (pipeline-state.ts)
```

- **동시 처리**: 5개 파일 병렬
- **재시도**: 실패 시 3회 재시도 후 스킵
- **상태 추적**: 인메모리, Admin UI에서 1초 폴링

### 9.3 RAG 채팅 흐름

```
사용자 질의
  ↓
벡터화: generateEmbedding(query, 'RETRIEVAL_QUERY')
  ↓
pgvector 코사인 유사도 검색 (상위 5개)
  ↓
미디어 필터링 (이미지/비디오, 유사도 >= 상위값 * 0.95)
  ↓
RAG 프롬프트 구성 (검색 결과 + 사용자 질문)
  ↓
Gemini 3.1 Pro 스트리밍 응답
  ↓
첨부파일 메타데이터 + 텍스트 스트리밍 전송
  ↓
비동기: 어시스턴트 메시지 DB 저장 + 대화 제목 업데이트
```

### 9.4 단일 파일 Embedding 흐름

```
채팅 UI에서 파일 선택 + "embedding" 키워드 입력
  ↓
POST /api/embed (FormData)
  ↓
파일 검증 (크기 100MB, 지원 타입)
  ↓
embedFile(buffer, fileName) → GCS + 임베딩 + DB 저장
  ↓
{ fileName, chunksCreated } 응답
```

---

## 10. CLI 스크립트

### 10.1 데이터베이스 초기화 (setup-db.ts)

```bash
pnpm db:setup
# 또는
npx tsx src/scripts/setup-db.ts
```

**수행 작업**:
1. pgvector 확장 설치
2. embeddings, conversations, messages 테이블 생성
3. 벡터 인덱스 (IVFFlat), 파일명 인덱스, 메시지 인덱스 생성

**출력 예시**:
```
Connecting to PostgreSQL...
1. Creating pgvector extension...
2. Creating tables...
3. Creating indexes...
Database setup complete!
```

### 10.2 배치 임베딩 파이프라인 (pipeline.ts)

```bash
pnpm pipeline -- ./data/products
# 또는
npx tsx src/scripts/pipeline.ts ./data/products
```

**동작**:
1. `.env.local` 환경변수 로드
2. 지정 디렉토리의 파일 스캔 및 필터링
3. 5개씩 병렬로 `embedFile()` 실행
4. 결과 출력

**출력 예시**:
```
Scanning: /path/to/products
Found 10 supported files
✅ product1.pdf (25 chunks)
✅ product2.png (1 chunks)
❌ Error: corrupted.pdf
Done: 9 succeeded, 1 failed
```

---

## 11. 설정 파일

### 11.1 tsconfig.json

- **타겟**: ES2017, ESNext 모듈
- **엄격 모드**: `strict: true`
- **경로 별칭**: `@/*` → `./src/*`
- **증분 빌드**: `incremental: true`

### 11.2 postcss.config.mjs

Tailwind CSS v4를 PostCSS 플러그인으로 적용합니다.

### 11.3 eslint.config.mjs

ESLint v9+ 플랫 설정:
- `eslint-config-next/core-web-vitals` (성능 최적화 규칙)
- `eslint-config-next/typescript` (TypeScript 규칙)
- `.next/`, `out/`, `build/` 무시

### 11.4 globals.css

- Tailwind CSS v4 + tw-animate-css + shadcn/tailwind.css
- `@tailwindcss/typography` 플러그인
- 커스텀 색상 변수 (보라색 기반 테마)
- 사이드바, 차트 색상 정의 (oklch 색상 공간)

---

## 12. 핵심 설정값 레퍼런스

| 설정 | 값 | 위치 |
|------|-----|------|
| 임베딩 차원 | 3072 | `gemini.ts`, `schema.ts` |
| 청크 크기 | 2,000 글자 | `file-parser.ts` |
| 청크 오버랩 | 200 글자 | `file-parser.ts` |
| 검색 상위 K | 5 | `rag.ts` |
| 파이프라인 동시 처리 | 5 파일 | `pipeline/start/route.ts`, `pipeline.ts` |
| 파이프라인 재시도 | 3회 | `pipeline/start/route.ts` |
| 최대 파일 크기 | 100 MB | `embed/route.ts` |
| 최대 메시지 길이 | 10,000 자 | `chat/route.ts` |
| 유사도 임계값 비율 | 0.95 | `chat/route.ts` |
| 로그 최대 보관 | 100개 | `pipeline-state.ts` |
| 대화 제목 최대 길이 | 200 자 (자동생성 30자) | `schema.ts`, `chat/route.ts` |
| 파일 캐시 TTL | 86,400초 (1일) | `files/[...path]/route.ts` |
| 벡터 인덱스 | IVFFlat + vector_cosine_ops | `schema.ts`, `setup-db.ts` |

---

## 13. 보안 고려사항

### 구현된 보안

| 항목 | 구현 | 위치 |
|------|------|------|
| 입력 검증 | 타입, 길이, UUID 형식 | 모든 API 라우트 |
| SQL 인젝션 방지 | Drizzle ORM 파라미터 바인딩 | `db.ts`, `rag.ts` |
| Path Traversal 방지 | `uploads/` 프리픽스, `..` 차단 | `gcs.ts` |
| 디렉토리 접근 제한 | `ALLOWED_BASE_DIRS` 화이트리스트 | `pipeline/start/route.ts` |
| GCS 프록시 | 공개 URL 대신 프록시 URL 사용 | `gcs.ts`, `files/route.ts` |
| 파일명 무작위화 | UUID로 GCS 파일명 생성 | `gcs.ts` |
| 파일 크기 제한 | 100MB | `embed/route.ts` |

### 미구현 (개인용/내부용 프로젝트)

| 항목 | 상태 |
|------|------|
| 인증/인가 | 미구현 |
| Rate Limiting | 미구현 |
| CORS 설정 | Next.js 기본값 |
| HTTPS | 배포 환경에서 구성 필요 |
| 감사 로깅 | 미구현 |

---

## 부록: 빠른 참조

### API 엔드포인트 요약

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/api/chat` | POST | RAG 채팅 (스트리밍) |
| `/api/embed` | POST | 단일 파일 임베딩 |
| `/api/conversations` | GET/POST/DELETE | 대화 CRUD |
| `/api/pipeline/start` | POST | 배치 파이프라인 시작 |
| `/api/pipeline/status` | GET | 파이프라인 상태 조회 |
| `/api/files/[...path]` | GET | GCS 파일 프록시 |

### npm 스크립트

| 명령어 | 설명 |
|--------|------|
| `pnpm dev` | 개발 서버 |
| `pnpm build` | 프로덕션 빌드 |
| `pnpm start` | 프로덕션 서버 |
| `pnpm lint` | ESLint 검사 |
| `pnpm db:setup` | DB 초기화 |
| `pnpm pipeline -- <path>` | 배치 임베딩 |
