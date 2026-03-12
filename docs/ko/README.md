# Gemini RAG 시스템

Next.js 15 App Router 기반의 멀티모달 RAG(Retrieval-Augmented Generation) 시스템입니다. Google Gemini 모델을 활용하여 텍스트, PDF, 이미지, 오디오, 비디오 등 다양한 형식의 파일을 임베딩하고, 벡터 검색 기반의 지능형 채팅을 제공합니다.

---

## 주요 기능

- **멀티모달 임베딩**: 텍스트, PDF, 이미지, 오디오, 비디오를 `gemini-embedding-2-preview` (3072차원)로 임베딩
- **RAG 기반 채팅**: 벡터 검색 + 이중 언어 쿼리 번역 + 파일명 검색을 결합한 하이브리드 검색
- **스트리밍 응답**: Vercel AI SDK 기반 실시간 스트리밍 채팅 (gemini-3.1-pro-preview)
- **배치 파이프라인**: 로컬 디렉토리 또는 GCS 버킷의 파일을 일괄 임베딩 처리
- **멀티모달 첨부파일**: 채팅 응답에 관련 이미지/파일을 자동 첨부
- **대화 관리**: 대화 이력 저장 및 사이드바 UI

---

## 기술 스택

| 카테고리 | 기술 |
|---|---|
| **프레임워크** | Next.js 15 (App Router) |
| **언어** | TypeScript |
| **AI 모델 (임베딩)** | Google Gemini `gemini-embedding-2-preview` (3072차원) |
| **AI 모델 (채팅)** | Google Gemini `gemini-3.1-pro-preview` |
| **AI SDK** | Vercel AI SDK (`@ai-sdk/google`) |
| **벡터 DB** | PostgreSQL + pgvector (코사인 유사도) |
| **ORM** | Drizzle ORM |
| **파일 저장소** | Google Cloud Storage (GCS) |
| **UI 컴포넌트** | shadcn/ui + Tailwind CSS |
| **아이콘** | Lucide React |
| **마크다운 렌더링** | ReactMarkdown |
| **PDF 처리** | pdf-lib |

---

## 빠른 시작

### 필수 조건

- **Node.js** 18 이상
- **PostgreSQL** 15 이상 (pgvector 확장 설치 필요)
- **Google Cloud** 프로젝트 (Gemini API 키 + GCS 버킷)

### 1. 설치

```bash
git clone <repository-url>
cd gemini-embedding-2-test
npm install
```

### 2. 환경 설정

프로젝트 루트에 `.env.local` 파일을 생성합니다:

```env
# 필수
GEMINI_API_KEY=your-gemini-api-key
DATABASE_URL=postgresql://user:password@localhost:5432/gemini_rag
GCS_BUCKET_NAME=your-gcs-bucket
GCS_PROJECT_ID=your-gcp-project-id

# 선택
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
GEMINI_EMBEDDING_MODEL=gemini-embedding-2-preview
GEMINI_CHAT_MODEL=gemini-3.1-pro-preview
```

### 3. 데이터베이스 설정

```bash
# pgvector 확장 설치 (PostgreSQL)
CREATE EXTENSION IF NOT EXISTS vector;

# 스키마 초기화
npx tsx src/scripts/setup-db.ts
```

### 4. 실행

```bash
# 개발 서버
npm run dev

# 프로덕션 빌드
npm run build
npm start
```

브라우저에서 `http://localhost:3000`을 열면 자동으로 `/chat` 페이지로 리다이렉트됩니다.

---

## 프로젝트 구조

```
src/
├── app/                          # Next.js App Router
│   ├── layout.tsx, page.tsx      # 루트 레이아웃 (/chat으로 리다이렉트)
│   ├── chat/page.tsx             # 채팅 UI (사이드바 + 대화창)
│   ├── admin/pipeline/page.tsx   # 배치 파이프라인 관리 UI
│   └── api/                      # API 라우트
│       ├── chat/route.ts         # RAG 질의 (스트리밍 응답)
│       ├── embed/route.ts        # 단일 파일 임베딩
│       ├── pipeline/             # 배치 파이프라인
│       ├── conversations/route.ts # 대화 CRUD
│       └── files/[...path]/route.ts # GCS 파일 프록시
├── lib/                          # 핵심 라이브러리
│   ├── gemini.ts                 # Gemini API 클라이언트
│   ├── db.ts                     # PostgreSQL 연결
│   ├── schema.ts                 # Drizzle 스키마
│   ├── embedding.ts              # 임베딩 로직
│   ├── rag.ts                    # RAG 파이프라인
│   ├── file-parser.ts            # 파일 분류 및 파싱
│   ├── gcs.ts                    # GCS 클라이언트
│   ├── env.ts                    # 환경변수 검증
│   └── pipeline-state.ts         # 파이프라인 상태 관리
├── components/                   # React 컴포넌트
│   ├── ChatSidebar.tsx           # 대화 목록 사이드바
│   ├── ChatWindow.tsx            # 메시지 표시
│   ├── ChatInput.tsx             # 텍스트 입력 + 파일 업로드
│   └── PipelineDashboard.tsx     # 파이프라인 관리
└── scripts/                      # CLI 스크립트
    ├── pipeline.ts               # 배치 임베딩 CLI
    └── setup-db.ts               # DB 초기화
```

---

## CLI 사용법

### 배치 임베딩 파이프라인

로컬 디렉토리의 파일을 일괄 임베딩합니다:

```bash
# 로컬 디렉토리
npx tsx src/scripts/pipeline.ts ./data

# GCS 버킷
npx tsx src/scripts/pipeline.ts gs://your-bucket/path
```

### 데이터베이스 초기화

```bash
npx tsx src/scripts/setup-db.ts
```

---

## API 엔드포인트 요약

| 메서드 | 경로 | 설명 |
|---|---|---|
| `POST` | `/api/chat` | RAG 기반 채팅 (스트리밍 응답) |
| `POST` | `/api/embed` | 단일 파일 임베딩 |
| `POST` | `/api/pipeline/start` | 배치 파이프라인 시작 |
| `POST` | `/api/pipeline/upload` | 브라우저 폴더 업로드 파이프라인 |
| `GET` | `/api/pipeline/status` | 파이프라인 진행률 조회 |
| `GET` | `/api/conversations` | 대화 목록 조회 |
| `POST` | `/api/conversations` | 새 대화 생성 |
| `DELETE` | `/api/conversations` | 대화 삭제 |
| `GET` | `/api/files/[...path]` | GCS 파일 프록시 |

상세 API 문서는 [API.md](./API.md)를 참고하세요.

---

## 관련 문서

- [아키텍처](./ARCHITECTURE.md) - 시스템 아키텍처 및 Mermaid 다이어그램
- [API 레퍼런스](./API.md) - 상세 API 문서
- [배포 가이드](./DEPLOYMENT.md) - 배포 및 설정 가이드
