import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { conversations } from '@/lib/schema';
import { eq, desc } from 'drizzle-orm';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET() {
  try {
    const result = await db
      .select()
      .from(conversations)
      .orderBy(desc(conversations.updatedAt));

    return NextResponse.json(result);
  } catch (err) {
    console.error('GET /api/conversations error:', err instanceof Error ? err.message : 'Unknown error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const title = typeof body.title === 'string' ? body.title.slice(0, 200) : '새 대화';

    const [conv] = await db
      .insert(conversations)
      .values({ title })
      .returning();

    return NextResponse.json(conv);
  } catch (err) {
    console.error('POST /api/conversations error:', err instanceof Error ? err.message : 'Unknown error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id || !UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Valid UUID id required' }, { status: 400 });
    }

    await db.delete(conversations).where(eq(conversations.id, id));
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/conversations error:', err instanceof Error ? err.message : 'Unknown error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
