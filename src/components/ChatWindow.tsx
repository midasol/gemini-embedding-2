'use client';

import { ScrollArea } from '@/components/ui/scroll-area';
import { useEffect, useRef } from 'react';

interface Attachment {
  type: string;
  path: string;
  fileName: string;
  similarity: number;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments?: Attachment[];
}

interface ChatWindowProps {
  messages: Message[];
  streamingContent?: string;
}

export function ChatWindow({ messages, streamingContent }: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  return (
    <ScrollArea className="flex-1 p-4">
      <div className="max-w-3xl mx-auto space-y-6">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-lg p-4 ${
              msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
            }`}>
              <p className="whitespace-pre-wrap">{msg.content}</p>
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {msg.attachments
                    .filter((a) => a.type === 'image')
                    .map((a, i) => (
                      <div key={i} className="space-y-1">
                        <img
                          src={a.path}
                          alt={a.fileName}
                          className="rounded border w-full h-24 object-cover"
                        />
                        <p className="text-xs truncate">{a.fileName}</p>
                        <p className="text-xs text-muted-foreground">
                          {(a.similarity * 100).toFixed(0)}%
                        </p>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {streamingContent && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-lg p-4 bg-muted">
              <p className="whitespace-pre-wrap">{streamingContent}</p>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
