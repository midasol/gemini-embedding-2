import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { conversations, messages } from '@/lib/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET() {
  const result = await db
    .select()
    .from(conversations)
    .orderBy(desc(conversations.updatedAt));

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const [conv] = await db
    .insert(conversations)
    .values({ title: body.title ?? '새 대화' })
    .returning();

  return NextResponse.json(conv);
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  await db.delete(conversations).where(eq(conversations.id, id));
  return NextResponse.json({ success: true });
}
