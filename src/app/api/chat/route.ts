import { google } from '@ai-sdk/google';
import { streamText } from 'ai';
import { NextRequest } from 'next/server';
import { searchSimilar, buildRAGPrompt } from '@/lib/rag';
import { db } from '@/lib/db';
import { messages, conversations } from '@/lib/schema';
import { eq } from 'drizzle-orm';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { message, conversationId } = await req.json();

  // Search similar documents
  const searchResults = await searchSimilar(message, 5);

  // Build RAG prompt
  const ragPrompt = buildRAGPrompt(message, searchResults);

  // Get conversation history
  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt);

  const chatMessages = history.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  // Save user message
  await db.insert(messages).values({
    conversationId,
    role: 'user',
    content: message,
  });

  // Collect attachments from search results (images/videos)
  const attachments = searchResults
    .filter((r) => ['image', 'video'].includes(r.fileType))
    .map((r) => ({
      type: r.fileType,
      path: r.filePath,
      fileName: r.fileName,
      similarity: r.similarity,
    }));

  // Stream response
  const result = streamText({
    model: google('gemini-2.5-pro-preview-06-05'),
    messages: [
      ...chatMessages,
      { role: 'user', content: ragPrompt },
    ],
  });

  // Save assistant response after streaming completes
  const response = result.toTextStreamResponse();

  result.text.then(async (fullText) => {
    await db.insert(messages).values({
      conversationId,
      role: 'assistant',
      content: fullText,
      attachments,
    });

    // Update conversation title if first message
    if (history.length === 0) {
      const title = message.length > 30 ? message.substring(0, 30) + '...' : message;
      await db
        .update(conversations)
        .set({ title, updatedAt: new Date() })
        .where(eq(conversations.id, conversationId));
    }
  });

  return response;
}
