import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { headers } from 'next/headers';
import { EngageAdminPanel } from '@reactkits.dev/react-engage/admin';
import '@reactkits.dev/react-engage/styles.css';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function EngageAdminPage() {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });

  if (!session?.user || !isAdminEmail(session.user.email)) {
    redirect('/dashboard');
  }

  return (
    <div className="p-6 bg-background text-foreground min-h-screen space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Engage Suite Dashboard</h1>
        <p className="text-sm text-muted">
          Manage support tickets, inspect bug environment metadata, edit email templates, and send newsletter broadcasts.
        </p>
      </div>

      <EngageAdminPanel
        apiEndpoint="/api/engage"
        theme="inherit"
      />
    </div>
  );
}
