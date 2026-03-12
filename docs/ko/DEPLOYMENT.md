# 배포 및 설정 가이드

Gemini RAG 시스템의 배포 환경 구성, 외부 서비스 설정, 프로덕션 고려사항을 설명합니다.

---

## 목차

1. [환경변수 레퍼런스](#1-환경변수-레퍼런스)
2. [데이터베이스 설정](#2-데이터베이스-설정)
3. [Google Cloud Storage 설정](#3-google-cloud-storage-설정)
4. [Gemini API 설정](#4-gemini-api-설정)
5. [임베딩 포맷 제한](#5-임베딩-포맷-제한)
6. [프로덕션 고려사항](#6-프로덕션-고려사항)

---

## 1. 환경변수 레퍼런스

`.env.local` 파일에 설정합니다. `env.ts`에서 필수 변수의 존재 여부를 검증합니다.

### 필수 환경변수

| 변수명 | 설명 | 예시 |
|---|---|---|
| `GEMINI_API_KEY` | Google Gemini API 키 | `AIzaSy...` |
| `DATABASE_URL` | PostgreSQL 연결 문자열 | `postgresql://user:pass@localhost:5432/gemini_rag` |
| `GCS_BUCKET_NAME` | Google Cloud Storage 버킷 이름 | `my-rag-bucket` |
| `GCS_PROJECT_ID` | GCP 프로젝트 ID | `my-gcp-project` |

### 선택 환경변수

| 변수명 | 설명 | 기본값 |
|---|---|---|
| `GOOGLE_APPLICATION_CREDENTIALS` | GCP 서비스 계정 JSON 파일 경로 | (ADC 사용) |
| `GEMINI_EMBEDDING_MODEL` | 임베딩 모델 이름 | `gemini-embedding-2-preview` |
| `GEMINI_CHAT_MODEL` | 채팅 LLM 모델 이름 | `gemini-3.1-pro-preview` |

### 환경변수 파일 예시

```env
# === 필수 ===
GEMINI_API_KEY=AIzaSyBxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
DATABASE_URL=postgresql://postgres:password@localhost:5432/gemini_rag
GCS_BUCKET_NAME=my-rag-files
GCS_PROJECT_ID=my-project-123456

# === 선택 ===
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
GEMINI_EMBEDDING_MODEL=gemini-embedding-2-preview
GEMINI_CHAT_MODEL=gemini-3.1-pro-preview
```

---

## 2. 데이터베이스 설정

### 2.1 PostgreSQL 설치 및 pgvector 확장

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

### 2.2 pgvector 확장 활성화

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 2.3 스키마 초기화

프로젝트에 포함된 설정 스크립트를 실행합니다:

```bash
npx tsx src/scripts/setup-db.ts
```

이 스크립트는 다음 테이블과 인덱스를 생성합니다:

#### embeddings 테이블

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

-- IVFFlat 인덱스 (코사인 유사도 검색용)
CREATE INDEX embedding_idx ON embeddings
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- 파일명 검색 인덱스
CREATE INDEX file_name_idx ON embeddings (file_name);
```

#### conversations 테이블

```sql
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

#### messages 테이블

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

-- 대화별 메시지 조회 인덱스
CREATE INDEX conv_created_idx ON messages (conversation_id, created_at);
```

### 2.4 IVFFlat 인덱스 튜닝

IVFFlat 인덱스의 `lists` 파라미터는 데이터 양에 따라 조정합니다:

| 총 행 수 | 권장 `lists` 값 |
|---|---|
| < 1,000 | 10 |
| 1,000 ~ 10,000 | 50 |
| 10,000 ~ 100,000 | 100 |
| 100,000 ~ 1,000,000 | 300-500 |
| > 1,000,000 | sqrt(행 수) |

> IVFFlat 인덱스는 데이터가 존재한 후에 생성해야 최적의 성능을 얻을 수 있습니다. 대량 데이터를 초기 적재한 후 인덱스를 재생성하는 것을 권장합니다.

---

## 3. Google Cloud Storage 설정

### 3.1 버킷 생성

```bash
# gcloud CLI
gcloud storage buckets create gs://my-rag-files \
  --project=my-project-123456 \
  --location=asia-northeast3 \
  --uniform-bucket-level-access
```

### 3.2 서비스 계정 설정

```bash
# 서비스 계정 생성
gcloud iam service-accounts create rag-storage \
  --display-name="RAG Storage Account"

# Storage 권한 부여
gcloud projects add-iam-policy-binding my-project-123456 \
  --member="serviceAccount:rag-storage@my-project-123456.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"

# 키 파일 생성
gcloud iam service-accounts keys create service-account.json \
  --iam-account=rag-storage@my-project-123456.iam.gserviceaccount.com
```

### 3.3 인증 방법

**방법 1: 서비스 계정 키 파일** (권장 - 로컬 개발)

```env
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

**방법 2: ADC (Application Default Credentials)** (권장 - GCE/Cloud Run)

```bash
gcloud auth application-default login
```

GCE 또는 Cloud Run에서는 인스턴스에 연결된 서비스 계정이 자동으로 사용됩니다.

### 3.4 GCS 보안

시스템은 다음과 같은 보안 메커니즘을 적용합니다:

- **경로 정규화**: `path.normalize()`를 통한 정규화
- **경로 순회 방지**: `..` 포함 경로 차단
- **접두사 검증**: `ALLOWED_GCS_PREFIX`로 허용된 경로 범위 제한
- 프록시 API (`/api/files/[...path]`)를 통해서만 파일 접근 가능

---

## 4. Gemini API 설정

### 4.1 API 키 발급

1. [Google AI Studio](https://aistudio.google.com/)에 접속
2. API 키 생성
3. `GEMINI_API_KEY` 환경변수에 설정

### 4.2 사용 모델

| 용도 | 모델 | 환경변수 |
|---|---|---|
| 임베딩 | `gemini-embedding-2-preview` | `GEMINI_EMBEDDING_MODEL` |
| 채팅 | `gemini-3.1-pro-preview` | `GEMINI_CHAT_MODEL` |

### 4.3 Gemini API 호출 용도

`gemini.ts` 클라이언트는 다음 3가지 용도로 Gemini API를 호출합니다:

| 용도 | API 메서드 | 설명 |
|---|---|---|
| **임베딩** | `embedContent` | 텍스트/멀티모달 콘텐츠를 3072차원 벡터로 변환 |
| **번역** | `generateContent` | 비영어 쿼리를 영어로 번역 (RAG 이중 언어 검색) |
| **요약** | `generateContent` | 멀티모달 파일(PDF, 이미지 등)의 콘텐츠 요약 생성 |

채팅 LLM 호출은 Vercel AI SDK (`@ai-sdk/google`)를 통해 별도로 수행됩니다.

---

## 5. 임베딩 포맷 제한

Gemini Embedding API (`gemini-embedding-2-preview`)의 입력 포맷 제한사항입니다.

### 5.1 텍스트

| 항목 | 제한 |
|---|---|
| 최대 토큰 수 | 8,192 토큰 |
| 청킹 전략 | 2,000자 / 200자 오버랩 |

### 5.2 이미지

| 항목 | 제한 |
|---|---|
| 지원 포맷 | PNG, JPEG |
| 요청당 최대 개수 | 6개 |
| 비지원 포맷 | GIF, WebP, BMP, TIFF, SVG 등 |

### 5.3 오디오

| 항목 | 제한 |
|---|---|
| 지원 포맷 | MP3, WAV |
| 최대 길이 | 80초 |
| 비지원 포맷 | OGG, FLAC, AAC, WMA 등 |

### 5.4 비디오

| 항목 | 제한 |
|---|---|
| 지원 포맷 | MP4, MOV |
| 최대 길이 | 128초 |
| 지원 코덱 | H264, H265, AV1, VP9 |
| 비지원 포맷 | AVI, MKV, WebM, FLV 등 |

### 5.5 PDF

| 항목 | 제한 |
|---|---|
| 멀티모달 임베딩 시 최대 페이지 | 6페이지 |
| 초과 시 처리 | pdf-lib로 6페이지 단위 자동 분할 |

### 5.6 포맷 제한 요약 표

| 미디어 타입 | 지원 포맷 | 핵심 제한 |
|---|---|---|
| 텍스트 | 모든 텍스트 파일 | 8,192 토큰 |
| 이미지 | PNG, JPEG | 요청당 6개 |
| 오디오 | MP3, WAV | 80초 |
| 비디오 | MP4, MOV | 128초 |
| PDF | PDF | 6페이지 (자동 분할) |

---

## 6. 프로덕션 고려사항

### 6.1 성능 최적화

#### 데이터베이스

- **연결 풀링**: Drizzle ORM의 연결 풀 설정 조정 (PgBouncer 권장)
- **IVFFlat 인덱스**: 대량 데이터 적재 후 인덱스 재생성
- **VACUUM**: 대량 삭제 후 `VACUUM ANALYZE embeddings` 실행
- **probes 설정**: 검색 정확도와 속도의 트레이드오프 조정

```sql
-- 검색 정확도 향상 (속도 감소)
SET ivfflat.probes = 10;
```

#### 파이프라인

- 동시 처리 파일 수: 기본 3개 (Gemini API rate limit 고려)
- 실패 시 최대 3회 재시도
- 인메모리 상태 관리 (서버 재시작 시 상태 소실)

### 6.2 확장성

```mermaid
graph TB
    subgraph Current["현재 아키텍처"]
        SingleServer["단일 Next.js 서버"]
        InMemoryState["인메모리 파이프라인 상태"]
        SingleDB["단일 PostgreSQL"]
    end

    subgraph Scalable["확장 고려사항"]
        LB["로드 밸런서"]
        MultiServer["다중 Next.js 인스턴스"]
        Redis["Redis<br/>(파이프라인 상태)"]
        PGPool["PgBouncer<br/>(연결 풀)"]
        ReadReplica["Read Replica<br/>(벡터 검색용)"]
        CDN["CDN<br/>(GCS 프록시 캐싱)"]
    end

    SingleServer -.->|"확장 시"| LB
    LB --> MultiServer
    InMemoryState -.->|"확장 시"| Redis
    SingleDB -.->|"확장 시"| PGPool
    PGPool --> ReadReplica
```

#### 확장 시 주요 변경 사항

| 영역 | 현재 | 확장 시 권장 |
|---|---|---|
| 파이프라인 상태 | 인메모리 (`pipeline-state.ts`) | Redis 또는 DB 기반 |
| DB 연결 | 직접 연결 | PgBouncer 연결 풀 |
| 파일 프록시 | Next.js 서버 직접 처리 | CDN 캐싱 + 서명된 URL |
| 벡터 인덱스 | IVFFlat | HNSW (더 높은 정확도, 메모리 사용 증가) |
| 배치 처리 | API 서버 내 처리 | 별도 워커 프로세스 / 큐 |

### 6.3 보안 체크리스트

- [ ] `GEMINI_API_KEY`를 환경변수/시크릿 매니저로 관리 (코드에 하드코딩 금지)
- [ ] `GOOGLE_APPLICATION_CREDENTIALS` 파일의 권한을 최소화 (Storage Object Admin만)
- [ ] `DATABASE_URL`에 SSL 연결 사용 (`?sslmode=require`)
- [ ] GCS 버킷에 공개 접근 차단 (Uniform bucket-level access)
- [ ] Next.js 서버 앞에 리버스 프록시(Nginx 등) 배치
- [ ] CORS 설정 확인
- [ ] Rate limiting 적용

### 6.4 모니터링

권장 모니터링 항목:

| 항목 | 설명 |
|---|---|
| Gemini API 응답 시간 | 임베딩/채팅 API 레이턴시 |
| Gemini API 오류율 | Rate limit, 모델 오류 등 |
| 벡터 검색 레이턴시 | pgvector 쿼리 응답 시간 |
| DB 연결 수 | PostgreSQL 활성 연결 수 |
| GCS 업로드/다운로드 | 파일 전송 성공률 |
| 파이프라인 실패율 | 배치 처리 실패 파일 비율 |
| 메모리 사용량 | 특히 대용량 파일 처리 시 |

### 6.5 배포 플랫폼

| 플랫폼 | 적합성 | 비고 |
|---|---|---|
| **Vercel** | 적합 (제한적) | Serverless 함수 시간 제한 주의, 파이프라인은 별도 서비스 필요 |
| **Google Cloud Run** | 권장 | GCS/Gemini와 동일 인프라, 최대 요청 시간 설정 가능 |
| **GKE (Kubernetes)** | 권장 (대규모) | 완전한 제어, 워커 분리 가능 |
| **AWS ECS/Fargate** | 가능 | GCS 대신 S3 고려 필요 |
| **자체 서버** | 가능 | Docker Compose로 배포 |

### 6.6 Docker Compose 예시

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
