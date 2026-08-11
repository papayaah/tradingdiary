import { createEngageRouteHandler } from '@reactkits.dev/react-engage/server';
import { db } from '@/lib/db/server';
import { engageTickets, engageSubscribers, engageTemplates } from '@/lib/db/server/schema';

export const { GET, POST } = createEngageRouteHandler({
  db,
  tables: {
    tickets: engageTickets,
    subscribers: engageSubscribers,
    templates: engageTemplates,
  },
});
