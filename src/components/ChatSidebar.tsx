'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Trash2, MessageSquare } from 'lucide-react';

interface Conversation {
  id: string;
  title: string;
  createdAt: string;
}

interface ChatSidebarProps {
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}

export function ChatSidebar({ activeId, onSelect, onNew }: ChatSidebarProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);

  useEffect(() => {
    fetch('/api/conversations')
      .then((r) => r.json())
      .then(setConversations);
  }, [activeId]);

  async function handleDelete(id: string) {
    await fetch(`/api/conversations?id=${id}`, { method: 'DELETE' });
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) onNew();
  }

  return (
    <div className="w-64 border-r bg-muted/30 flex flex-col h-full">
      <div className="p-4">
        <Button onClick={onNew} className="w-full" variant="outline">
          <Plus className="mr-2 h-4 w-4" /> 새 대화
        </Button>
      </div>
      <ScrollArea className="flex-1">
        {conversations.map((conv) => (
          <div
            key={conv.id}
            className={`flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-muted/50 ${
              activeId === conv.id ? 'bg-muted' : ''
            }`}
            onClick={() => onSelect(conv.id)}
          >
            <MessageSquare className="h-4 w-4 shrink-0" />
            <span className="truncate flex-1 text-sm">{conv.title}</span>
            <button
              onClick={(e) => { e.stopPropagation(); handleDelete(conv.id); }}
              className="opacity-0 group-hover:opacity-100 hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
      </ScrollArea>
    </div>
  );
}
