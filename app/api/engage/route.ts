import { createEngageRouteHandler } from '@reactkits.dev/react-engage/server';
import { db } from '@/lib/db/server';
import { engageTickets, engageSubscribers, engageTemplates, engageBroadcasts, engageSuggestionVotes } from '@/lib/db/server/schema';
import { auth } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { tradingDiaryEngageEmailContent } from '@/lib/engage-server-content';

export const { GET, POST } = createEngageRouteHandler({
  db,
  senderName: 'Trading Diary Support',
  emailContent: tradingDiaryEngageEmailContent,
  resolveRequestUser: async (request) => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.email) return null;

    return {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      isAdmin: isAdminEmail(session.user.email),
    };
  },
  tables: {
    tickets: engageTickets,
    subscribers: engageSubscribers,
    templates: engageTemplates,
    broadcasts: engageBroadcasts,
    suggestionVotes: engageSuggestionVotes,
  },
});
