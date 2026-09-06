import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export interface AuthenticatedAIUser {
  userId: string;
}

/**
 * AI is a signed-in feature. Keep this check at the start of every AI route so
 * neither hosted credits nor user-supplied provider keys can be used by guests.
 */
export async function authenticateAIRequest(
  request: NextRequest,
): Promise<AuthenticatedAIUser | null> {
  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user ? { userId: session.user.id } : null;
}

export function aiAuthenticationRequiredResponse() {
  return NextResponse.json(
    {
      error: 'Sign in to use AI features.',
      code: 'AI_AUTHENTICATION_REQUIRED',
    },
    { status: 401 },
  );
}
