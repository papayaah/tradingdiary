'use client';

import type { ReactNode } from 'react';
import { LoaderCircle, Sparkles } from 'lucide-react';
import { useJournalAI } from '@/contexts/JournalAIContext';

function renderInline(text: string, keyBase: string): ReactNode[] {
  // Split on ** … ** for bold; odd segments are emphasized.
  return text.split(/\*\*/).map((part, i) =>
    i % 2 === 1 ? <strong key={`${keyBase}-b${i}`}>{part}</strong> : <span key={`${keyBase}-t${i}`}>{part}</span>,
  );
}

/** Minimal markdown: paragraphs, `*`/`-` bullet lists, and **bold** inline. */
function SimpleMarkdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  let key = 0;

  const flushList = () => {
    if (!list.length) return;
    const items = list;
    list = [];
    const id = key++;
    blocks.push(
      <ul key={`ul${id}`} className="my-2 list-disc space-y-1 pl-5">
        {items.map((item, i) => (
          <li key={i}>{renderInline(item, `ul${id}-${i}`)}</li>
        ))}
      </ul>,
    );
  };

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trimEnd();
    const bullet = line.match(/^\s*[*-]\s+(.*)$/);
    if (bullet) {
      list.push(bullet[1]);
      continue;
    }
    flushList();
    if (line.trim() === '') continue;
    const id = key++;
    blocks.push(
      <p key={`p${id}`} className="my-2 leading-relaxed">
        {renderInline(line, `p${id}`)}
      </p>,
    );
  }
  flushList();

  return <div className="text-[14.5px] text-ink">{blocks}</div>;
}

/** The AI answer body (loading / answer / error), shared by the dropdown and the
 * floating panel so they render identically. */
export default function AnswerContent() {
  const { status, answer, error } = useJournalAI();

  if (status === 'loading') {
    return (
      <div className="flex items-center gap-2 text-[14px] text-ink-soft">
        <LoaderCircle size={16} className="animate-spin" /> Reading your trades…
      </div>
    );
  }

  if (status === 'answer' && answer) {
    return (
      <>
        <SimpleMarkdown text={answer.answer} />
        <div className="mt-4 flex items-center gap-1.5 text-[12.5px] text-ink-soft">
          <Sparkles size={13} className="text-paper-profit" /> Grounded on your real trades
        </div>
      </>
    );
  }

  if (status === 'error') {
    return <div className="text-[14px] text-ink">{error}</div>;
  }

  return null;
}
