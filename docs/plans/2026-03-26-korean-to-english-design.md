# Korean to English Translation - Design Document

## Goal

Translate all Korean text in the codebase (UI strings, system prompts, DB defaults, documentation) to English.

## Approach

Direct in-place translation. No i18n framework or constants extraction — just replace Korean strings with English equivalents in each file.

## Source Code Changes (10 files)

### System Prompts & LLM Instructions
- **src/lib/rag.ts**: RAG system prompts (no-results message, context labels, search result formatting, instructions)
- **src/lib/gemini.ts**: Content summary prompt for multimodal files

### Database Defaults
- **src/lib/schema.ts**: `default('New Chat')` instead of `'새 대화'`
- **src/scripts/setup-db.ts**: SQL `DEFAULT 'New Chat'`
- **src/app/api/conversations/route.ts**: Fallback title `'New Chat'`

### UI Components
- **src/components/ChatWindow.tsx**: Loading indicators, empty state text
- **src/components/ChatInput.tsx**: "Remove" button label
- **src/components/PipelineDashboard.tsx**: All pipeline UI labels (title, status, start, success/fail/pending, file count, placeholders)

### Pages
- **src/app/admin/pipeline/page.tsx**: Page header, back link
- **src/app/chat/page.tsx**: Embedding success message

## Documentation Changes (6 files)

All translated to English in-place:
- `docs/ko/README.md`
- `docs/ko/DEPLOYMENT.md`
- `docs/ko/API.md`
- `docs/ko/ARCHITECTURE.md`
- `docs/GUIDE.ko.md`
- `README.ko.md`

## Out of Scope

- Code logic, variable names, file structure
- English README.md (already English)
- UI component library files (shadcn/ui)
- Comments already in English
