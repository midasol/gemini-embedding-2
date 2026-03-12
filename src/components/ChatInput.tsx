'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Paperclip, Send } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface ChatInputProps {
  onSend: (message: string, file?: File) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [input, setInput] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() && !file) return;
    onSend(input, file ?? undefined);
    setInput('');
    setFile(null);
  }

  return (
    <form onSubmit={handleSubmit} className="border-t p-4">
      {file && (
        <div className="mb-2 flex items-center gap-2">
          <Badge variant="secondary">{file.name}</Badge>
          <button type="button" onClick={() => setFile(null)} className="text-xs text-muted-foreground hover:text-destructive">
            삭제
          </button>
        </div>
      )}
      <div className="flex gap-2 max-w-3xl mx-auto">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="메시지를 입력하세요..."
          disabled={disabled}
          className="flex-1"
        />
        <Button type="submit" disabled={disabled || (!input.trim() && !file)}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </form>
  );
}
