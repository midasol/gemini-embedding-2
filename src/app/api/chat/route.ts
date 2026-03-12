import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText } from 'ai';
import { NextRequest, NextResponse } from 'next/server';
import { searchSimilar, buildRAGPrompt } from '@/lib/rag';
import { env } from '@/lib/env';

const google = createGoogleGenerativeAI({ apiKey: env.GEMINI_API_KEY });
import { db } from '@/lib/db';
import { messages, conversations } from '@/lib/schema';
import { eq } from 'drizzle-orm';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_MESSAGE_LENGTH = 10000;

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, conversationId } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }
    if (!conversationId || !UUID_REGEX.test(conversationId)) {
      return NextResponse.json({ error: 'Valid conversationId is required' }, { status: 400 });
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json({ error: `Message exceeds maximum length of ${MAX_MESSAGE_LENGTH}` }, { status: 400 });
    }

    const searchResults = await searchSimilar(message, 5);
    const ragPrompt = buildRAGPrompt(message, searchResults);

    const history = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt);

    const chatMessages = history.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    await db.insert(messages).values({
      conversationId,
      role: 'user',
      content: message,
    });

    const MIN_MEDIA_SIMILARITY = 0.4;
    const SIMILARITY_RATIO = 0.95;

    const mediaResults = searchResults
      .filter((r) => ['image', 'video'].includes(r.fileType) && r.similarity >= MIN_MEDIA_SIMILARITY)
      .sort((a, b) => b.similarity - a.similarity);

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

    const result = streamText({
      model: google(env.GEMINI_CHAT_MODEL),
      messages: [
        ...chatMessages,
        { role: 'user', content: ragPrompt },
      ],
    });

    // Create a custom stream that prepends attachments as JSON, then streams text
    const encoder = new TextEncoder();
    const textStream = result.textStream;

    const stream = new ReadableStream({
      async start(controller) {
        // Send attachments as first chunk with a special prefix
        if (attachments.length > 0) {
          controller.enqueue(encoder.encode(`__ATTACHMENTS__${JSON.stringify(attachments)}__END_ATTACHMENTS__`));
        }

        try {
          for await (const chunk of textStream) {
            controller.enqueue(encoder.encode(chunk));
          }
        } catch (err) {
          console.error('Stream error:', err instanceof Error ? err.message : 'Unknown error');
        } finally {
          controller.close();
        }
      },
    });

    // Save assistant response after streaming
    Promise.resolve(result.text).then(async (fullText) => {
      await db.insert(messages).values({
        conversationId,
        role: 'assistant',
        content: fullText,
        attachments,
      });

      if (history.length === 0) {
        const title = message.length > 30 ? message.substring(0, 30) + '...' : message;
        await db
          .update(conversations)
          .set({ title, updatedAt: new Date() })
          .where(eq(conversations.id, conversationId));
      }
    }).catch((err: unknown) => {
      console.error('Failed to save assistant message:', err instanceof Error ? err.message : 'Unknown error');
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  } catch (err) {
    console.error('POST /api/chat error:', err instanceof Error ? err.message : 'Unknown error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
