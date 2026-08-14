import { createEngageRouteHandler } from '@reactkits.dev/react-engage/server';
import { db } from '@/lib/db/server';
import { engageTickets, engageSubscribers, engageTemplates, engageBroadcasts } from '@/lib/db/server/schema';
import { auth } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';

export const { GET, POST } = createEngageRouteHandler({
  db,
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
  },
});
