# Similarity Threshold Filtering Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show all media attachments whose similarity is within 95% of the top result's similarity, instead of showing only the single best match.

**Architecture:** Change the attachment filtering logic in the chat API route from "top 1 only" to "all results where similarity >= topSimilarity * 0.95". The frontend AttachmentGrid already supports multiple images — no UI changes needed.

**Tech Stack:** TypeScript, Next.js API route

---

### Current Behavior

```typescript
// src/app/api/chat/route.ts (lines 50-56)
const mediaResults = searchResults
  .filter((r) => ['image', 'video'].includes(r.fileType))
  .sort((a, b) => b.similarity - a.similarity);

const attachments = mediaResults.length > 0
  ? [{ type: mediaResults[0].fileType, path: mediaResults[0].filePath, fileName: mediaResults[0].fileName, similarity: mediaResults[0].similarity }]
  : [];
```

Only the single highest-similarity media result is sent to the client.

### Desired Behavior

- Sort media results by similarity descending (already done)
- Take the top result's similarity as the reference
- Include all media results whose similarity >= reference * 0.95
- Example: if top result has similarity 0.82, threshold = 0.82 * 0.95 = 0.779, so all results with similarity >= 0.779 are included

---

### Task 1: Update attachment filtering logic

**Files:**
- Modify: `src/app/api/chat/route.ts:50-56`

**Step 1: Replace the single-result filter with threshold-based filter**

Change lines 50-56 from:

```typescript
const mediaResults = searchResults
  .filter((r) => ['image', 'video'].includes(r.fileType))
  .sort((a, b) => b.similarity - a.similarity);

const attachments = mediaResults.length > 0
  ? [{ type: mediaResults[0].fileType, path: mediaResults[0].filePath, fileName: mediaResults[0].fileName, similarity: mediaResults[0].similarity }]
  : [];
```

To:

```typescript
const mediaResults = searchResults
  .filter((r) => ['image', 'video'].includes(r.fileType))
  .sort((a, b) => b.similarity - a.similarity);

const SIMILARITY_RATIO = 0.95;
const topSimilarity = mediaResults[0]?.similarity ?? 0;
const threshold = topSimilarity * SIMILARITY_RATIO;

const attachments = mediaResults
  .filter((r) => r.similarity >= threshold)
  .map((r) => ({
    type: r.fileType,
    path: r.filePath,
    fileName: r.fileName,
    similarity: r.similarity,
  }));
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Verify build**

Run: `pnpm build`
Expected: Compiled successfully

**Step 4: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat: show all attachments within 95% of top similarity score"
```
