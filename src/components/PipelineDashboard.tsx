'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Play } from 'lucide-react';

interface PipelineStatus {
  running: boolean;
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
  currentFile: string;
  logs: Array<{ fileName: string; status: 'success' | 'error'; message?: string; duration: number }>;
}

export function PipelineDashboard() {
  const [sourcePath, setSourcePath] = useState('');
  const [status, setStatus] = useState<PipelineStatus | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  async function startPipeline() {
    await fetch('/api/pipeline/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourcePath }),
    });
    startPolling();
  }

  function startPolling() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(async () => {
      const res = await fetch('/api/pipeline/status');
      const data = await res.json();
      setStatus(data);
      if (!data.running && intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }, 1000);
  }

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const progress = status ? (status.total > 0 ? (status.completed / status.total) * 100 : 0) : 0;

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">배치 Embedding 파이프라인</h1>

      <div className="flex gap-2">
        <Input
          value={sourcePath}
          onChange={(e) => setSourcePath(e.target.value)}
          placeholder="소스 경로 (로컬 폴더 또는 GCS 버킷)"
          className="flex-1"
        />
        <Button onClick={startPipeline} disabled={!sourcePath || status?.running}>
          <Play className="mr-2 h-4 w-4" /> 시작
        </Button>
      </div>

      {status && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <span className="font-medium">상태:</span>
            <Badge variant={status.running ? 'default' : 'secondary'}>
              {status.running ? '진행 중' : '완료'}
            </Badge>
            {status.currentFile && (
              <span className="text-sm text-muted-foreground">현재: {status.currentFile}</span>
            )}
          </div>

          <Progress value={progress} className="h-3" />
          <p className="text-sm text-muted-foreground">
            {status.completed} / {status.total} 파일 ({progress.toFixed(0)}%)
          </p>

          <div className="flex gap-4 text-sm">
            <span className="text-green-600">성공: {status.succeeded}</span>
            <span className="text-red-600">실패: {status.failed}</span>
            <span className="text-muted-foreground">대기: {status.total - status.completed}</span>
          </div>

          <ScrollArea className="h-48 border rounded p-3">
            {status.logs.map((log, i) => (
              <div key={i} className="flex items-center gap-2 py-1 text-sm">
                <span>{log.status === 'success' ? '\u2705' : '\u274C'}</span>
                <span className="flex-1 truncate">{log.fileName}</span>
                <span className="text-muted-foreground">{(log.duration / 1000).toFixed(1)}s</span>
                {log.message && <span className="text-red-500 text-xs truncate max-w-48">{log.message}</span>}
              </div>
            ))}
          </ScrollArea>
        </Card>
      )}
    </div>
  );
}
