# Korean to English Translation - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Translate all Korean text to English across 10 source files and 6 documentation files.

**Architecture:** Direct in-place string replacement. No i18n framework. Each task targets one logical group of files, commits after each group.

**Tech Stack:** Next.js 15, TypeScript, React, Drizzle ORM, PostgreSQL

---

### Task 1: Translate RAG System Prompts

**Files:**
- Modify: `src/lib/rag.ts` (lines 118-144)

**Step 1: Replace Korean strings in `buildRAGPrompt` function**

The no-results branch (line 120-124):
```typescript
    return `You are a RAG assistant.
No relevant documents were found. Please inform the user: "No relevant documents found. Please embed related files first."

## User Question:
${query}`;
```

The context formatting (lines 127-143):
```typescript
  const context = results.map((r, i) => {
    const parts: string[] = [];
    if (r.chunkText) parts.push(r.chunkText);
    if (r.contentSummary) parts.push(`[Visual Description] ${r.contentSummary}`);
    const content = parts.join('\n\n') || '';
    const fileInfo = `[File: ${r.fileName}, Type: ${r.fileType}, Similarity: ${(r.similarity * 100).toFixed(1)}%]`;
    return `--- Search Result ${i + 1} ${fileInfo} ---\n${content}`;
  }).join('\n\n');

  return `You are a RAG assistant that answers questions based on retrieved documents.
If the search results contain image files, include the file description and filename in your response.
For information not found in the search results, respond with "The requested information was not found in the search results."

## Retrieved Documents:
${context}

## User Question:
${query}`;
```

**Step 2: Verify no Korean remains**

Run: `grep -n '[가-힣]' src/lib/rag.ts`
Expected: No output

**Step 3: Commit**

```bash
git add src/lib/rag.ts
git commit -m "feat: translate RAG system prompts from Korean to English"
```

---

### Task 2: Translate Gemini Content Summary Prompt

**Files:**
- Modify: `src/lib/gemini.ts` (line 57)

**Step 1: Replace Korean prompt**

Line 57 — change:
```typescript
      { text: '이 파일의 내용을 상세하게 설명해주세요. 텍스트, 색상, 형태, 특징 등을 포함하세요.' },
```
to:
```typescript
      { text: 'Describe the contents of this file in detail. Include text, colors, shapes, and features.' },
```

**Step 2: Verify no Korean remains**

Run: `grep -n '[가-힣]' src/lib/gemini.ts`
Expected: No output

**Step 3: Commit**

```bash
git add src/lib/gemini.ts
git commit -m "feat: translate Gemini content summary prompt to English"
```

---

### Task 3: Translate Database Defaults

**Files:**
- Modify: `src/lib/schema.ts` (line 26)
- Modify: `src/scripts/setup-db.ts` (line 44)
- Modify: `src/app/api/conversations/route.ts` (line 25)

**Step 1: Update schema.ts**

Line 26 — change `default('새 대화')` to `default('New Chat')`

**Step 2: Update setup-db.ts**

Line 44 — change `DEFAULT '새 대화'` to `DEFAULT 'New Chat'`

**Step 3: Update conversations/route.ts**

Line 25 — change `'새 대화'` to `'New Chat'`

**Step 4: Verify no Korean remains in all three files**

Run: `grep -n '[가-힣]' src/lib/schema.ts src/scripts/setup-db.ts src/app/api/conversations/route.ts`
Expected: No output

**Step 5: Commit**

```bash
git add src/lib/schema.ts src/scripts/setup-db.ts src/app/api/conversations/route.ts
git commit -m "feat: translate database default values to English"
```

---

### Task 4: Translate UI Components

**Files:**
- Modify: `src/components/ChatWindow.tsx` (lines 71, 124)
- Modify: `src/components/ChatInput.tsx` (line 42)
- Modify: `src/components/PipelineDashboard.tsx` (lines 79, 86, 91, 96, 112, 120, 122, 125, 131, 135-137)

**Step 1: Update ChatWindow.tsx**

Line 71 — change:
```typescript
  const label = type === 'embedding' ? '임베딩 처리 중...' : '검색하고 있어요...';
```
to:
```typescript
  const label = type === 'embedding' ? 'Processing embedding...' : 'Searching...';
```

Line 124 — change:
```typescript
              질문을 입력하면 임베딩된 데이터를 검색하여 답변을 생성합니다.
```
to:
```typescript
              Enter a question to search embedded data and generate an answer.
```

**Step 2: Update ChatInput.tsx**

Line 42 — change `삭제` to `Remove`

**Step 3: Update PipelineDashboard.tsx**

All Korean strings:

| Line | Korean | English |
|------|--------|---------|
| 79 | `배치 Embedding 파이프라인` | `Batch Embedding Pipeline` |
| 86 | `GCS 경로 (예: gs://bucket/prefix)` | `GCS path (e.g. gs://bucket/prefix)` |
| 91 | `시작` | `Start` |
| 96 | `또는` | `or` |
| 112 | `로컬 폴더 선택` | `Select Local Folder` |
| 120 | `상태:` | `Status:` |
| 122 | `'진행 중' : '완료'` | `'In Progress' : 'Completed'` |
| 125 | `현재:` | `Current:` |
| 131 | `파일` | `files` |
| 135 | `성공:` | `Success:` |
| 136 | `실패:` | `Failed:` |
| 137 | `대기:` | `Pending:` |

**Step 4: Verify no Korean remains**

Run: `grep -n '[가-힣]' src/components/ChatWindow.tsx src/components/ChatInput.tsx src/components/PipelineDashboard.tsx`
Expected: No output

**Step 5: Commit**

```bash
git add src/components/ChatWindow.tsx src/components/ChatInput.tsx src/components/PipelineDashboard.tsx
git commit -m "feat: translate UI component labels to English"
```

---

### Task 5: Translate Page Components

**Files:**
- Modify: `src/app/admin/pipeline/page.tsx` (lines 8, 10)
- Modify: `src/app/chat/page.tsx` (line 71)

**Step 1: Update admin/pipeline/page.tsx**

Line 8 — change `Admin: 파이프라인 관리` to `Admin: Pipeline Management`
Line 10 — change `채팅으로 돌아가기` to `Back to Chat`

**Step 2: Update chat/page.tsx**

Line 71 — change:
```typescript
        { id: crypto.randomUUID(), role: 'assistant', content: `파일 '${result.fileName}'이 성공적으로 임베딩되었습니다. (${result.chunksCreated}개 청크 생성)` },
```
to:
```typescript
        { id: crypto.randomUUID(), role: 'assistant', content: `File '${result.fileName}' has been successfully embedded. (${result.chunksCreated} chunks created)` },
```

**Step 3: Verify no Korean remains**

Run: `grep -n '[가-힣]' src/app/admin/pipeline/page.tsx src/app/chat/page.tsx`
Expected: No output

**Step 4: Commit**

```bash
git add src/app/admin/pipeline/page.tsx src/app/chat/page.tsx
git commit -m "feat: translate page component labels to English"
```

---

### Task 6: Verify All Source Code is Korean-Free

**Step 1: Run a full Korean text scan on src/**

Run: `grep -rn '[가-힣]' src/`
Expected: No output

If any Korean remains, fix it before proceeding.

**Step 2: Build check**

Run: `pnpm build`
Expected: Build succeeds with no errors

**Step 3: Commit (if any fixes were needed)**

---

### Task 7: Translate Documentation - docs/ko/README.md

**Files:**
- Modify: `docs/ko/README.md`

**Step 1: Translate the entire file to English in-place**

Preserve all markdown formatting, code blocks, tables, and links. Translate only the Korean prose and table content.

**Step 2: Verify no Korean remains**

Run: `grep -n '[가-힣]' docs/ko/README.md`
Expected: No output (except possibly Korean text inside code examples that are intentional)

**Step 3: Commit**

```bash
git add docs/ko/README.md
git commit -m "docs: translate docs/ko/README.md to English"
```

---

### Task 8: Translate Documentation - docs/ko/DEPLOYMENT.md

**Files:**
- Modify: `docs/ko/DEPLOYMENT.md`

**Step 1: Translate the entire file to English in-place**

Preserve all markdown formatting, code blocks, tables, Mermaid diagrams, and links.

**Step 2: Verify no Korean remains**

Run: `grep -n '[가-힣]' docs/ko/DEPLOYMENT.md`
Expected: No output

**Step 3: Commit**

```bash
git add docs/ko/DEPLOYMENT.md
git commit -m "docs: translate docs/ko/DEPLOYMENT.md to English"
```

---

### Task 9: Translate Documentation - docs/ko/API.md

**Files:**
- Modify: `docs/ko/API.md`

**Step 1: Translate the entire file to English in-place**

Preserve all markdown formatting, code blocks, tables, Mermaid diagrams, and links.

**Step 2: Verify no Korean remains**

Run: `grep -n '[가-힣]' docs/ko/API.md`
Expected: No output (except possibly Korean text in example request bodies)

**Step 3: Commit**

```bash
git add docs/ko/API.md
git commit -m "docs: translate docs/ko/API.md to English"
```

---

### Task 10: Translate Documentation - docs/ko/ARCHITECTURE.md

**Files:**
- Modify: `docs/ko/ARCHITECTURE.md`

**Step 1: Translate the entire file to English in-place**

Preserve all markdown formatting, Mermaid diagrams (translate labels inside diagrams too), tables, and links.

**Step 2: Verify no Korean remains**

Run: `grep -n '[가-힣]' docs/ko/ARCHITECTURE.md`
Expected: No output

**Step 3: Commit**

```bash
git add docs/ko/ARCHITECTURE.md
git commit -m "docs: translate docs/ko/ARCHITECTURE.md to English"
```

---

### Task 11: Translate Documentation - docs/GUIDE.ko.md

**Files:**
- Modify: `docs/GUIDE.ko.md`

**Step 1: Translate the entire file to English in-place**

Preserve all markdown formatting, code blocks, ASCII diagrams, tables, and links.

**Step 2: Verify no Korean remains**

Run: `grep -n '[가-힣]' docs/GUIDE.ko.md`
Expected: No output

**Step 3: Commit**

```bash
git add docs/GUIDE.ko.md
git commit -m "docs: translate docs/GUIDE.ko.md to English"
```

---

### Task 12: Translate Documentation - README.ko.md

**Files:**
- Modify: `README.ko.md`

**Step 1: Translate the entire file to English in-place**

Preserve all markdown formatting, code blocks, tables, and links.

**Step 2: Verify no Korean remains**

Run: `grep -n '[가-힣]' README.ko.md`
Expected: No output

**Step 3: Commit**

```bash
git add README.ko.md
git commit -m "docs: translate README.ko.md to English"
```

---

### Task 13: Final Verification

**Step 1: Full Korean scan across entire project (excluding node_modules, .next, .git)**

Run: `grep -rn '[가-힣]' --include='*.ts' --include='*.tsx' --include='*.md' . | grep -v node_modules | grep -v .next`
Expected: No output

**Step 2: Build verification**

Run: `pnpm build`
Expected: Build succeeds

**Step 3: Final commit (if any stragglers fixed)**
