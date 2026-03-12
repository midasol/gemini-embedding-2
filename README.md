# Gemini RAG Chat

Gemini 모델 기반 멀티모달 RAG(Retrieval-Augmented Generation) 채팅 시스템입니다.
텍스트, PDF, 이미지, 오디오, 비디오 파일을 벡터 임베딩으로 변환하고, 의미 기반 검색 + AI 스트리밍 응답을 제공합니다.

---

## 사전 준비사항 (Prerequisites)

시작하기 전에 아래 항목이 설치/준비되어 있어야 합니다.

### 1. Node.js

Node.js **20 이상**이 필요합니다.

```bash
# 버전 확인
node -v
# v20.x.x 이상이어야 합니다

# 설치 (macOS - Homebrew)
brew install node

# 또는 nvm으로 설치
nvm install 20
nvm use 20
```

### 2. pnpm

이 프로젝트는 pnpm 패키지 매니저를 사용합니다.

```bash
# 설치
npm install -g pnpm

# 버전 확인
pnpm -v
```

### 3. PostgreSQL + pgvector

벡터 검색을 위해 pgvector 확장이 설치된 PostgreSQL이 필요합니다.

```bash
# macOS - Homebrew
brew install postgresql@16
brew services start postgresql@16

# pgvector 확장 설치
brew install pgvector

# 데이터베이스 생성
createdb gemini_rag
```

> pgvector 확장은 `pnpm db:setup` 실행 시 자동으로 활성화됩니다 (`CREATE EXTENSION IF NOT EXISTS vector`).

### 4. Google Cloud 계정 및 API 키

#### Gemini API 키 발급

1. [Google AI Studio](https://aistudio.google.com/apikey)에 접속
2. "Create API Key" 클릭
3. API 키를 복사하여 보관

#### Google Cloud Storage (GCS) 설정

1. [Google Cloud Console](https://console.cloud.google.com/)에 접속
2. 새 프로젝트 생성 (또는 기존 프로젝트 선택)
3. **Cloud Storage** > "버킷 만들기"로 버킷 생성
4. **IAM 및 관리** > "서비스 계정"에서 서비스 계정 생성
5. 서비스 계정에 **Storage Object Admin** 역할 부여
6. 서비스 계정의 JSON 키 파일 다운로드

---

## Step-by-Step 설치 가이드

### Step 1: 프로젝트 클론

```bash
git clone <repository-url> gemini-rag-chat
cd gemini-rag-chat
```

### Step 2: 의존성 설치

```bash
pnpm install
```

설치되는 주요 패키지:
- `@google/genai` - Gemini API 클라이언트
- `@ai-sdk/google` + `ai` - Vercel AI SDK (스트리밍)
- `drizzle-orm` + `postgres` - PostgreSQL ORM
- `@google-cloud/storage` - GCS 클라이언트
- `pdf-parse` - PDF 텍스트 추출
- `next` + `react` - 웹 프레임워크

### Step 3: 환경변수 설정

프로젝트 루트에 `.env.local` 파일을 생성합니다.

```bash
cp .env.local.example .env.local   # 예시 파일이 있는 경우
# 또는 직접 생성
```

`.env.local` 내용:

```env
# === 필수 ===

# Gemini API 키 (https://aistudio.google.com/apikey 에서 발급)
GEMINI_API_KEY=your-gemini-api-key-here

# PostgreSQL 연결 문자열
DATABASE_URL=postgresql://username:password@localhost:5432/gemini_rag

# Google Cloud Storage
GCS_BUCKET_NAME=your-bucket-name
GCS_PROJECT_ID=your-gcp-project-id

# === 선택 (기본값 있음) ===

# GCS 서비스 계정 JSON 경로 (없으면 ADC 사용)
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json

# 모델 이름 (기본값 사용 시 생략 가능)
# GEMINI_EMBEDDING_MODEL=gemini-embedding-2-preview
# GEMINI_CHAT_MODEL=gemini-3.1-pro-preview
```

> 서비스 계정 JSON 파일이 있다면 프로젝트 루트에 `service-account.json`으로 저장하세요.

### Step 4: 데이터베이스 초기화

```bash
pnpm db:setup
```

성공 시 출력:

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

> IVFFlat 벡터 인덱스는 테이블에 데이터가 없으면 스킵될 수 있습니다. 첫 임베딩 후 재실행하면 됩니다.

### Step 5: 개발 서버 실행

```bash
pnpm dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000) 접속 → 자동으로 `/chat` 페이지로 이동합니다.

---

## 사용 방법

### 1. 파일 임베딩 (배치 처리)

폴더 내 파일을 일괄로 임베딩하려면 CLI 또는 Admin UI를 사용합니다.

#### CLI로 배치 임베딩

```bash
# data 폴더의 파일을 일괄 임베딩
pnpm pipeline -- ./data

# 예시: 특정 폴더
pnpm pipeline -- ./data/products
```

출력 예시:
```
Scanning: /path/to/data
Found 10 supported files
✅ manual.pdf (25 chunks)
✅ product.png (1 chunks)
✅ guide.txt (3 chunks)
...
Done: 10 succeeded, 0 failed
```

#### Admin UI로 배치 임베딩

1. 브라우저에서 [http://localhost:3000/admin/pipeline](http://localhost:3000/admin/pipeline) 접속
2. 소스 경로 입력 (예: `./data`)
3. "시작" 버튼 클릭
4. 실시간 진행률 확인 (1초마다 자동 업데이트)

> Admin UI에서는 보안을 위해 `./data`, `./uploads` 디렉토리만 접근 가능합니다.

### 2. RAG 채팅

1. [http://localhost:3000/chat](http://localhost:3000/chat) 접속
2. 메시지를 입력하면 임베딩된 문서에서 관련 내용을 검색하여 AI가 답변합니다
3. 이미지 파일이 검색 결과에 포함되면 썸네일과 함께 표시됩니다

### 3. 채팅 중 단일 파일 임베딩

1. 채팅 입력창의 클립 아이콘을 클릭하여 파일 선택
2. 메시지에 "embedding"을 포함하여 전송
   - 예: `이 파일 embedding 해줘`
3. 파일이 GCS에 업로드되고 벡터 임베딩이 생성됩니다

---

## 테스트 방법

### 테스트 1: 환경변수 확인

서버가 정상적으로 환경변수를 인식하는지 확인합니다.

```bash
# 개발 서버 실행
pnpm dev

# 브라우저에서 접속
open http://localhost:3000
```

`/chat` 페이지가 정상 로드되면 기본 환경이 올바르게 설정된 것입니다.

### 테스트 2: 데이터베이스 연결 확인

```bash
# PostgreSQL에 직접 접속하여 테이블 확인
psql $DATABASE_URL -c "\dt"
```

기대 결과:
```
           List of relations
 Schema |     Name      | Type  | Owner
--------+---------------+-------+-------
 public | conversations | table | user
 public | embeddings    | table | user
 public | messages      | table | user
```

### 테스트 3: 대화 API 동작 확인

```bash
# 대화 생성
curl -X POST http://localhost:3000/api/conversations \
  -H "Content-Type: application/json" \
  -d '{"title": "테스트 대화"}'

# 대화 목록 조회
curl http://localhost:3000/api/conversations
```

기대 결과:
```json
[{"id":"uuid-...","title":"테스트 대화","createdAt":"...","updatedAt":"..."}]
```

### 테스트 4: 파일 임베딩 테스트

테스트용 파일을 준비하고 임베딩합니다.

```bash
# 테스트 데이터 폴더 생성
mkdir -p ./data/test

# 테스트 텍스트 파일 생성
echo "Gemini는 Google이 개발한 멀티모달 AI 모델입니다.
텍스트, 이미지, 오디오, 비디오를 이해하고 생성할 수 있습니다." > ./data/test/gemini-info.txt

echo "PostgreSQL의 pgvector 확장은 벡터 유사도 검색을 지원합니다.
코사인 유사도, L2 거리, 내적 등의 연산을 제공합니다." > ./data/test/pgvector-info.txt

# CLI로 임베딩 실행
pnpm pipeline -- ./data/test
```

기대 결과:
```
Scanning: /path/to/data/test
Found 2 supported files
✅ gemini-info.txt (1 chunks)
✅ pgvector-info.txt (1 chunks)

Done: 2 succeeded, 0 failed
```

### 테스트 5: 임베딩 확인 (DB 조회)

```bash
psql $DATABASE_URL -c "SELECT file_name, file_type, chunk_index FROM embeddings;"
```

기대 결과:
```
    file_name     | file_type | chunk_index
------------------+-----------+-------------
 gemini-info.txt  | text      |           0
 pgvector-info.txt| text      |           0
```

### 테스트 6: RAG 채팅 테스트

```bash
# 대화 생성 (ID를 메모)
CONV_ID=$(curl -s -X POST http://localhost:3000/api/conversations \
  -H "Content-Type: application/json" \
  -d '{}' | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

echo "대화 ID: $CONV_ID"

# RAG 채팅 질의
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d "{\"message\": \"Gemini 모델에 대해 알려줘\", \"conversationId\": \"$CONV_ID\"}"
```

임베딩된 `gemini-info.txt`의 내용을 기반으로 AI가 응답하면 RAG 파이프라인이 정상 동작하는 것입니다.

### 테스트 7: 단일 파일 임베딩 API 테스트

```bash
# 테스트 파일을 API로 임베딩
curl -X POST http://localhost:3000/api/embed \
  -F "file=@./data/test/gemini-info.txt"
```

기대 결과:
```json
{"success":true,"fileName":"gemini-info.txt","chunksCreated":1}
```

### 테스트 8: 브라우저에서 전체 흐름 확인

1. [http://localhost:3000/chat](http://localhost:3000/chat) 접속
2. 좌측 사이드바에서 대화 목록 확인
3. 메시지 입력: `Gemini 모델이 뭐야?`
4. 스트리밍 응답이 나타나면 성공
5. 클립 아이콘으로 파일 업로드 후 `이 파일 embedding 해줘` 입력
6. 임베딩 완료 메시지 확인

---

## 지원 파일 형식

| 카테고리 | 확장자 | 처리 방식 |
|---------|--------|-----------|
| 텍스트 | `.txt`, `.md`, `.csv`, `.json`, `.xml`, `.html` | 텍스트 추출 → 청킹 → 임베딩 |
| PDF | `.pdf` | PDF 파싱 → 텍스트 추출 → 청킹 → 임베딩 |
| 이미지 | `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.bmp` | Base64 → 멀티모달 임베딩 + AI 요약 |
| 오디오 | `.mp3`, `.wav`, `.ogg`, `.flac`, `.m4a` | Base64 → 멀티모달 임베딩 + AI 요약 |
| 비디오 | `.mp4`, `.webm`, `.avi`, `.mov` | Base64 → 멀티모달 임베딩 + AI 요약 |

---

## 프로젝트 구조

```
src/
├── app/                       # Next.js App Router
│   ├── page.tsx               # / → /chat 리다이렉트
│   ├── chat/page.tsx          # 채팅 UI
│   ├── admin/pipeline/page.tsx # 파이프라인 관리
│   └── api/                   # API 엔드포인트
│       ├── chat/route.ts      # RAG 채팅 (스트리밍)
│       ├── embed/route.ts     # 단일 파일 임베딩
│       ├── conversations/     # 대화 CRUD
│       ├── pipeline/          # 배치 파이프라인
│       └── files/[...path]/   # GCS 파일 프록시
├── lib/                       # 공유 라이브러리
│   ├── gemini.ts              # Gemini API 클라이언트
│   ├── db.ts                  # PostgreSQL 연결
│   ├── schema.ts              # DB 스키마 (Drizzle)
│   ├── embedding.ts           # 임베딩 생성 로직
│   ├── rag.ts                 # RAG 검색 + 프롬프트
│   ├── file-parser.ts         # 파일 파싱/청킹
│   ├── gcs.ts                 # GCS 업로드/다운로드
│   └── env.ts                 # 환경변수 관리
├── components/                # React 컴포넌트
│   ├── ChatSidebar.tsx        # 대화 목록
│   ├── ChatWindow.tsx         # 메시지 표시
│   ├── ChatInput.tsx          # 입력 + 파일 첨부
│   └── PipelineDashboard.tsx  # 파이프라인 대시보드
└── scripts/                   # CLI 스크립트
    ├── setup-db.ts            # DB 초기화
    └── pipeline.ts            # 배치 임베딩
```

---

## npm 스크립트

| 명령어 | 설명 |
|--------|------|
| `pnpm dev` | 개발 서버 실행 (http://localhost:3000) |
| `pnpm build` | 프로덕션 빌드 |
| `pnpm start` | 프로덕션 서버 실행 |
| `pnpm lint` | ESLint 코드 검사 |
| `pnpm db:setup` | PostgreSQL 테이블 및 인덱스 초기화 |
| `pnpm pipeline -- <path>` | 폴더 내 파일 배치 임베딩 |

---

## 트러블슈팅

### pgvector 설치 오류

```
ERROR: could not open extension control file "vector"
```

pgvector가 PostgreSQL에 설치되어 있지 않습니다:
```bash
# macOS
brew install pgvector

# Ubuntu
sudo apt install postgresql-16-pgvector

# Docker
docker run -p 5432:5432 pgvector/pgvector:pg16
```

### DATABASE_URL 연결 실패

```
ERROR: connection refused
```

PostgreSQL이 실행 중인지 확인하세요:
```bash
# macOS
brew services list | grep postgresql
brew services start postgresql@16

# 직접 연결 테스트
psql postgresql://username:password@localhost:5432/gemini_rag
```

### GCS 인증 오류

```
ERROR: Could not load the default credentials
```

서비스 계정 JSON 파일 경로를 확인하세요:
```bash
# .env.local에서 경로 확인
cat .env.local | grep GOOGLE_APPLICATION_CREDENTIALS

# 파일 존재 여부 확인
ls -la ./service-account.json
```

### IVFFlat 인덱스 생성 실패

```
ERROR: at least 100 rows required for IVFFlat index
```

데이터가 충분히 쌓인 후 다시 실행하세요:
```bash
# 먼저 파일을 임베딩한 후
pnpm pipeline -- ./data

# DB 셋업 재실행 (인덱스 생성)
pnpm db:setup
```

### Gemini API 429 (Rate Limit)

```
ERROR: 429 Too Many Requests
```

동시 처리 수를 줄이거나 잠시 후 재시도하세요. 배치 파이프라인은 자동으로 3회 재시도합니다.

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프레임워크 | Next.js 16 (App Router), TypeScript |
| Embedding 모델 | gemini-embedding-2-preview (3072 차원) |
| LLM | gemini-3.1-pro-preview |
| DB | PostgreSQL + pgvector |
| ORM | Drizzle ORM |
| 파일 저장소 | Google Cloud Storage |
| AI 스트리밍 | Vercel AI SDK |
| UI | Tailwind CSS v4 + shadcn/ui |

> 상세 아키텍처와 코드 분석은 [docs/GUIDE.md](./docs/GUIDE.md)를 참고하세요.
