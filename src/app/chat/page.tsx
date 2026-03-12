'use client';

import { useState, useCallback } from 'react';
import { ChatSidebar } from '@/components/ChatSidebar';
import { ChatWindow } from '@/components/ChatWindow';
import { ChatInput } from '@/components/ChatInput';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments?: Array<{ type: string; path: string; fileName: string; similarity: number }>;
}

export default function ChatPage() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState('');
  const [loading, setLoading] = useState(false);

  const loadMessages = useCallback(async (id: string) => {
    setConversationId(id);
    setMessages([]);
  }, []);

  async function createConversation(): Promise<string> {
    const res = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const conv = await res.json();
    setConversationId(conv.id);
    setMessages([]);
    return conv.id;
  }

  async function handleSend(message: string, file?: File) {
    // Check if this is an embedding request
    if (file && message.includes('embedding')) {
      const formData = new FormData();
      formData.append('file', file);
      setLoading(true);
      const res = await fetch('/api/embed', { method: 'POST', body: formData });
      const result = await res.json();
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'user', content: `${file.name}\n${message}` },
        { id: crypto.randomUUID(), role: 'assistant', content: `파일 '${result.fileName}'이 성공적으로 임베딩되었습니다. (${result.chunksCreated}개 청크 생성)` },
      ]);
      setLoading(false);
      return;
    }

    let activeConvId = conversationId;
    if (!activeConvId) {
      activeConvId = await createConversation();
    }

    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'user', content: message }]);
    setLoading(true);
    setStreaming('');

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, conversationId: activeConvId }),
    });

    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    let fullText = '';

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        fullText += chunk;
        setStreaming(fullText);
      }
    }

    setStreaming('');
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: fullText }]);
    setLoading(false);
  }

  return (
    <div className="flex h-screen">
      <ChatSidebar
        activeId={conversationId}
        onSelect={loadMessages}
        onNew={() => { setConversationId(null); setMessages([]); }}
      />
      <div className="flex-1 flex flex-col">
        <header className="border-b px-6 py-3 font-semibold">
          Gemini RAG Chat
        </header>
        <ChatWindow messages={messages} streamingContent={streaming || undefined} />
        <ChatInput onSend={handleSend} disabled={loading} />
      </div>
    </div>
  );
}
