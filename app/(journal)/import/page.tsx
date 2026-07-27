import { redirect } from 'next/navigation';

export default function ImportPage() {
  redirect('/media?view=import');
}
