import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { createEngageRouteHandler } from '@reactkits.dev/react-engage/server';

describe('react-engage user ticket access', () => {
  it('returns only the authenticated user tickets', async () => {
    const { GET } = createEngageRouteHandler({
      resolveRequestUser: () => ({ email: 'trader.alex@example.com' }),
      initialTickets: [
        {
          id: 'tkt_001',
          type: 'bug',
          status: 'open',
          message: 'Import issue',
          userEmail: 'trader.alex@example.com',
          createdAt: '2026-08-20T00:00:00.000Z',
        },
        {
          id: 'tkt_other',
          type: 'ticket',
          status: 'open',
          message: 'Another user ticket',
          userEmail: 'someone@example.com',
          createdAt: '2026-08-20T00:00:00.000Z',
        },
      ],
    });

    const response = await GET(new NextRequest('http://localhost/api/engage?action=list_user_tickets'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.tickets).toHaveLength(1);
    expect(body.tickets[0].id).toBe('tkt_001');
  });

  it('requires authentication for the user ticket list', async () => {
    const { GET } = createEngageRouteHandler({ resolveRequestUser: () => null });

    const response = await GET(new NextRequest('http://localhost/api/engage?action=list_user_tickets'));

    expect(response.status).toBe(401);
  });

  it('protects the admin ticket list when authentication is configured', async () => {
    const { GET } = createEngageRouteHandler({
      resolveRequestUser: () => ({ email: 'user@example.com', isAdmin: false }),
    });

    const response = await GET(new NextRequest('http://localhost/api/engage?action=list_tickets'));

    expect(response.status).toBe(403);
  });
});
