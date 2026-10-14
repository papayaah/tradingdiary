import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { headers } from 'next/headers';
import '@reactkits.dev/react-engage/styles.css';
import { EngageAdminPanel } from '@reactkits.dev/react-engage/admin';
import { tradingDiaryEngageTemplates, tradingDiaryInitialBroadcastSubject } from '@/lib/engage-admin-content';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function EngageAdminPage() {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });

  if (!session?.user || !isAdminEmail(session.user.email)) {
    redirect('/calendar');
  }

  return (
    <div className="p-4 sm:p-6 bg-background text-foreground min-h-screen space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Email &amp; support</h1>
        <p className="text-sm text-muted">
          Send email, respond to support tickets, and manage newsletters.
        </p>
      </div>

      <EngageAdminPanel apiEndpoint="/api/engage" theme="inherit" defaultTab="email" mailbox
        initialTemplates={tradingDiaryEngageTemplates}
        initialBroadcastSubject={tradingDiaryInitialBroadcastSubject} />
    </div>
  );
}
