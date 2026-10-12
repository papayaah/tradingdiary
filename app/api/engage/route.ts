import { createEngageRouteHandler } from '@reactkits.dev/react-engage/server';
import { db } from '@/lib/db/server';
import { engageTickets, engageSubscribers, engageTemplates, engageBroadcasts, engageSuggestionVotes } from '@/lib/db/server/schema';
import { auth } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { tradingDiaryEngageEmailContent } from '@/lib/engage-server-content';
import { tradingDiaryEmailSender } from '@/lib/engage-sender';
import { tradingDiaryEmailStore } from '@/lib/engage-email-store';
import { NextRequest } from 'next/server';

async function resolveRequestUser(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.email) return null;

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    isAdmin: isAdminEmail(session.user.email),
  };
}

export const { GET, POST } = createEngageRouteHandler({
  db,
  senderName: tradingDiaryEmailSender.name,
  senderEmail: tradingDiaryEmailSender.email,
  emailContent: tradingDiaryEngageEmailContent,
  resolveRequestUser,
  mailbox: { store: tradingDiaryEmailStore, inboundSecret: process.env.ENGAGE_INBOUND_SECRET },
  tables: {
    tickets: engageTickets,
    subscribers: engageSubscribers,
    templates: engageTemplates,
    broadcasts: engageBroadcasts,
    suggestionVotes: engageSuggestionVotes,
  },
});
