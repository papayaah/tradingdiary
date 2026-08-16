import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { deleteAllJournal } from '@/lib/journal/server-sync';

/** DELETE /api/journal — permanently delete all of the signed-in user's
 * server-side journal data. Local IndexedDB is cleared separately by the client. */
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }
    await deleteAllJournal(session.user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Journal delete failed:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
