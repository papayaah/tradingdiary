import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { headers } from 'next/headers';
import AdminDashboard from '@/components/admin/AdminDashboard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });

  if (!session?.user || !isAdminEmail(session.user.email)) {
    redirect('/dashboard');
  }

  return (
    <div className="p-6 bg-background text-foreground min-h-screen">
      <AdminDashboard />
    </div>
  );
}
