'use client';

import { useParams } from 'next/navigation';
import PaperDayView from '@/components/journal/PaperDayView';

export default function JournalDayPage() {
  const params = useParams();
  const date = Array.isArray(params.date) ? params.date[0] : params.date ?? '';
  return <PaperDayView dateParam={date} />;
}
