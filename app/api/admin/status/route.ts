import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { isAdminEmail, isAdminAllowlistConfigured } from '@/lib/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    const userEmail = session?.user?.email;
    const isAdmin = Boolean(session?.user && isAdminEmail(userEmail));
    const allowlistConfigured = isAdminAllowlistConfigured();

    return NextResponse.json({
      isAdmin,
      allowlistConfigured,
      userEmail: isAdmin ? userEmail : undefined,
    });
  } catch (error) {
    return NextResponse.json({ isAdmin: false, allowlistConfigured: isAdminAllowlistConfigured() });
  }
}
