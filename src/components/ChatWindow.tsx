'use client';

import { ScrollArea } from '@/components/ui/scroll-area';
import { useEffect, useRef } from 'react';
import { User, Bot } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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
  streamingAttachments?: Attachment[];
  loading?: boolean;
}

function AttachmentGrid({ attachments }: { attachments: Attachment[] }) {
  const images = attachments.filter((a) => a.type === 'image');
  if (images.length === 0) return null;

  return (
    <div className="mt-4">
      {images.map((a, i) => (
        <div key={i} className="inline-block mr-3 mb-2">
          <img
            src={a.path}
            alt={a.fileName}
            className="rounded-lg border border-border w-48 h-36 object-cover cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => window.open(a.path, '_blank')}
          />
          <p className="text-xs text-muted-foreground mt-1.5 truncate max-w-48" title={a.fileName}>
            {a.fileName}
          </p>
          <p className="text-xs text-primary font-medium">
            {(a.similarity * 100).toFixed(0)}% match
          </p>
        </div>
      ))}
    </div>
  );
}

function UserMessage({ content }: { content: string }) {
  return (
    <div className="flex items-start gap-3 justify-end">
      <div className="max-w-[75%]">
        <p className="text-sm leading-relaxed text-foreground">{content}</p>
      </div>
      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
        <User className="h-4 w-4 text-muted-foreground" />
      </div>
    </div>
  );
}

function ThinkingIndicator() {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
        <Bot className="h-4 w-4 text-primary animate-pulse" />
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-xs font-semibold text-primary">GEMINI RAG</span>
        <div className="mt-2 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '300ms' }} />
          <span className="ml-2 text-sm text-muted-foreground">검색하고 있어요...</span>
        </div>
      </div>
    </div>
  );
}

function AssistantMessage({ content, attachments }: { content: string; attachments?: Attachment[] }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
        <Bot className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-xs font-semibold text-primary">GEMINI RAG</span>
        <div className="mt-1.5 prose prose-sm max-w-none text-foreground prose-headings:text-foreground prose-strong:text-foreground prose-a:text-primary prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:before:content-none prose-code:after:content-none prose-pre:bg-muted prose-pre:border prose-pre:border-border prose-li:marker:text-primary/60">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          {attachments && <AttachmentGrid attachments={attachments} />}
        </div>
      </div>
    </div>
  );
}

export function ChatWindow({ messages, streamingContent, streamingAttachments, loading }: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  return (
    <ScrollArea className="flex-1">
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        {messages.length === 0 && !streamingContent && (
          <div className="flex flex-col items-center justify-center h-[60vh] text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Bot className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-2">Gemini RAG Chat</h2>
            <p className="text-sm text-muted-foreground max-w-md">
              질문을 입력하면 임베딩된 데이터를 검색하여 답변을 생성합니다.
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id}>
            {msg.role === 'user' ? (
              <UserMessage content={msg.content} />
            ) : (
              <AssistantMessage content={msg.content} attachments={msg.attachments} />
            )}
          </div>
        ))}
        {loading && !streamingContent && <ThinkingIndicator />}
        {streamingContent && (
          <AssistantMessage
            content={streamingContent}
            attachments={streamingAttachments}
          />
        )}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
