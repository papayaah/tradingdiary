import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from './db/server';
import { engageEmailMessages as messages, engageTickets as tickets } from './db/server/schema';
import type { EmailMessage, EmailStore, EmailTicket } from '@reactkits.dev/react-engage/server';

function toMessage(row: typeof messages.$inferSelect): EmailMessage {
  return { ...row, providerMessageId: row.providerMessageId || undefined,
    inReplyTo: row.inReplyTo || undefined, error: row.error || undefined, readAt: row.readAt || undefined };
}
class DuplicateMessage extends Error {}

/** TradingDiary's persistence adapter; the reusable package owns the email workflow. */
export const tradingDiaryEmailStore: EmailStore = {
  async listThreads(folder) {
    const lastAt = sql<string>`max(${messages.createdAt})`;
    const rows = await db.select({
      id: tickets.id, subject: tickets.subject, contactEmail: tickets.userEmail, contactName: tickets.userName,
      status: tickets.status, updatedAt: lastAt,
      preview: sql<string>`left((array_agg(${messages.text} order by ${messages.createdAt} desc))[1], 160)`,
      unread: sql<boolean>`bool_or(${messages.direction} = 'incoming' and ${messages.readAt} is null)`,
    }).from(tickets).innerJoin(messages, eq(messages.ticketId, tickets.id)).groupBy(tickets.id)
      .having(sql`bool_or(${messages.direction} = ${folder === 'inbox' ? 'incoming' : 'outgoing'})`)
      .orderBy(desc(lastAt)).limit(100);
    return rows.map(row => ({ ...row, subject: row.subject || '(No subject)', contactEmail: row.contactEmail || '',
      contactName: row.contactName || undefined, status: row.status as EmailTicket['status'] }));
  },
  async getConversation(id) {
    const [ticketRows, messageRows] = await Promise.all([
      db.select().from(tickets).where(eq(tickets.id, id)).limit(1),
      db.select().from(messages).where(eq(messages.ticketId, id)).orderBy(desc(messages.createdAt)).limit(500),
    ]);
    const ticket = ticketRows[0];
    if (!ticket) return null;
    return { ticket: { id: ticket.id, subject: ticket.subject || 'Support request', message: ticket.message,
      userEmail: ticket.userEmail || '', userName: ticket.userName || undefined, category: ticket.category || undefined,
      status: ticket.status as EmailTicket['status'], createdAt: ticket.createdAt }, messages: messageRows.reverse().map(toMessage) };
  },
  async findMessage(id) {
    const rows = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
    return rows[0] ? toMessage(rows[0]) : null;
  },
  async findByProviderId(id) {
    const rows = await db.select().from(messages).where(eq(messages.providerMessageId, id)).limit(1);
    return rows[0] ? toMessage(rows[0]) : null;
  },
  async reserveMessage(ticket, message) {
    try {
      await db.transaction(async tx => {
        await tx.insert(tickets).values({ ...ticket, type: 'ticket' }).onConflictDoNothing();
        const inserted = await tx.insert(messages).values(message).onConflictDoNothing().returning({ id: messages.id });
        if (!inserted.length) throw new DuplicateMessage();
        if (message.direction === 'incoming') await tx.update(tickets).set({ status: 'open' }).where(eq(tickets.id, ticket.id));
      });
      return true;
    } catch (error) {
      if (error instanceof DuplicateMessage) return false;
      throw error;
    }
  },
  async updateDelivery(id, status, fields = {}) {
    await db.transaction(async tx => {
      const updated = await tx.update(messages).set({ status, ...fields }).where(eq(messages.id, id)).returning();
      if (!updated[0]) throw new Error('Email message does not exist');
      if (status === 'accepted') await tx.update(tickets).set({ status: 'resolved', adminReply: updated[0].text,
        repliedAt: updated[0].createdAt }).where(eq(tickets.id, updated[0].ticketId));
    });
  },
  async markRead(ticketId, ids) {
    if (!ids.length) return;
    await db.update(messages).set({ readAt: new Date().toISOString() })
      .where(and(eq(messages.ticketId, ticketId), eq(messages.direction, 'incoming'), inArray(messages.id, ids)));
  },
};
