import { PipelineDashboard } from '@/components/PipelineDashboard';
import Link from 'next/link';

export default function PipelinePage() {
  return (
    <div>
      <div className="border-b px-6 py-3 flex items-center justify-between">
        <span className="font-semibold">Admin: 파이프라인 관리</span>
        <Link href="/chat" className="text-sm text-muted-foreground hover:underline">
          &larr; 채팅으로 돌아가기
        </Link>
      </div>
      <PipelineDashboard />
    </div>
  );
}
