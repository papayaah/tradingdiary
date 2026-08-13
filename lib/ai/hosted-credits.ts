import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import type { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/server';
import { aiUsageEvent } from '@/lib/db/server/schema';
import {
  calculateTokenCostUsd,
  calendarMonthPeriodKey,
  createAICreditMeter,
  type AICreditMeterAdapter,
  type AICreditReservation,
  type AIUsageDetails,
} from '@/packages/ai-connect/src/server/credit-meter';

function nonNegativeInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback;
}

export const GUEST_AI_CREDITS = nonNegativeInteger(process.env.AI_GUEST_CREDITS, 5);
export const USER_MONTHLY_AI_CREDITS = nonNegativeInteger(process.env.AI_USER_MONTHLY_CREDITS, 50);
export const DAILY_HOSTED_AI_CREDIT_CAP = Math.max(
  1,
  nonNegativeInteger(process.env.AI_HOSTED_DAILY_CREDIT_CAP, 5000),
);
export const HOSTED_AI_MODEL = 'gemini-3.5-flash-lite';
export const HOSTED_AI_PRICING = {
  inputPerMillionUsd: 0.3,
  outputPerMillionUsd: 2.5,
} as const;

const GUEST_COOKIE = 'td_ai_guest';
const GUEST_PERIOD_KEY = 'lifetime';

const adapter: AICreditMeterAdapter = {
  async reserve(request) {
    return db.transaction(async (tx) => {
      const now = new Date();
      const dayKey = now.toISOString().slice(0, 10);
      const startOfDay = new Date(`${dayKey}T00:00:00.000Z`);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'hosted-ai-global:' + dayKey}))`);
      const lockKey = `${request.subject.type}:${request.subject.id}:${request.policy.periodKey}`;
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);

      const [globalUsage] = await tx
        .select({
          credits: sql<number>`coalesce(sum(case
            when ${aiUsageEvent.status} = 'succeeded' then ${aiUsageEvent.creditsCharged}
            else ${aiUsageEvent.creditsReserved}
          end), 0)`,
        })
        .from(aiUsageEvent)
        .where(and(
          sql`${aiUsageEvent.createdAt} >= ${startOfDay}`,
          sql`(${aiUsageEvent.status} = 'succeeded' or (${aiUsageEvent.status} = 'reserved' and ${aiUsageEvent.expiresAt} > ${now}))`,
        ));
      const globalCredits = Number(globalUsage?.credits ?? 0);

      const existing = await tx
        .select({
          status: aiUsageEvent.status,
          creditsReserved: aiUsageEvent.creditsReserved,
          creditsCharged: aiUsageEvent.creditsCharged,
        })
        .from(aiUsageEvent)
        .where(and(
          eq(aiUsageEvent.subjectType, request.subject.type),
          eq(aiUsageEvent.subjectId, request.subject.id),
          eq(aiUsageEvent.periodKey, request.policy.periodKey),
          sql`(${aiUsageEvent.status} = 'succeeded' or (${aiUsageEvent.status} = 'reserved' and ${aiUsageEvent.expiresAt} > ${now}))`,
        ));

      const used = existing.reduce(
        (sum, row) => sum + (row.status === 'succeeded' ? row.creditsCharged : 0),
        0,
      );
      const reserved = existing.reduce(
        (sum, row) => sum + (row.status === 'reserved' ? row.creditsReserved : 0),
        0,
      );
      const subjectAllowed = used + reserved + request.credits <= request.policy.allowance;
      const globallyAllowed = globalCredits + request.credits <= DAILY_HOSTED_AI_CREDIT_CAP;
      const allowed = subjectAllowed && globallyAllowed;

      if (allowed) {
        await tx.insert(aiUsageEvent).values({
          id: request.requestId,
          subjectType: request.subject.type,
          subjectId: request.subject.id,
          userId: request.subject.userId,
          periodKey: request.policy.periodKey,
          action: request.action,
          status: 'reserved',
          creditsReserved: request.credits,
          creditsCharged: 0,
          expiresAt: request.expiresAt,
        });
      }

      return {
        allowed,
        denialReason: !subjectAllowed ? 'subject_limit' : !globallyAllowed ? 'global_limit' : undefined,
        allowance: request.policy.allowance,
        used,
        reserved: reserved + (allowed ? request.credits : 0),
        remaining: Math.max(0, request.policy.allowance - used - reserved - (allowed ? request.credits : 0)),
      };
    });
  },

  async complete(requestId, usage) {
    await db
      .update(aiUsageEvent)
      .set({
        status: 'succeeded',
        creditsCharged: sql`${aiUsageEvent.creditsReserved}`,
        provider: usage.provider,
        model: usage.model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
        costUsd: usage.costUsd,
        completedAt: new Date(),
      })
      .where(and(eq(aiUsageEvent.id, requestId), eq(aiUsageEvent.status, 'reserved')));
  },

  async release(requestId, error, usage) {
    await db
      .update(aiUsageEvent)
      .set({
        status: 'failed',
        creditsCharged: 0,
        provider: usage?.provider,
        model: usage?.model,
        inputTokens: usage?.inputTokens,
        outputTokens: usage?.outputTokens,
        totalTokens: usage?.totalTokens,
        costUsd: usage?.costUsd,
        errorMessage: error?.slice(0, 500),
        completedAt: new Date(),
      })
      .where(and(eq(aiUsageEvent.id, requestId), eq(aiUsageEvent.status, 'reserved')));
  },
};

const meter = createAICreditMeter(adapter);

function guestCookieSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('BETTER_AUTH_SECRET is required for guest AI credits');
  }
  return 'trading-diary-development-guest-credit-secret';
}

function signGuestId(id: string): string {
  return createHmac('sha256', guestCookieSecret()).update(id).digest('base64url');
}

function encodeGuestCookie(id: string): string {
  return `${id}.${signGuestId(id)}`;
}

function decodeGuestCookie(value?: string): string | null {
  if (!value) return null;
  const separator = value.lastIndexOf('.');
  if (separator <= 0) return null;
  const id = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  const expected = signGuestId(id);
  if (signature.length !== expected.length) return null;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) ? id : null;
}

export interface HostedAICreditGate {
  reservation: AICreditReservation;
  guestCookie?: string;
  subjectType: 'guest' | 'user';
}

export async function reserveHostedAICredit(
  request: NextRequest,
  action: string,
  credits = 1,
): Promise<HostedAICreditGate> {
  const session = await auth.api.getSession({ headers: request.headers });
  let guestCookie: string | undefined;
  const subject = session?.user
    ? { type: 'user' as const, id: session.user.id, userId: session.user.id }
    : (() => {
        const existingId = decodeGuestCookie(request.cookies.get(GUEST_COOKIE)?.value);
        const id = existingId ?? crypto.randomUUID();
        if (!existingId) guestCookie = encodeGuestCookie(id);
        return { type: 'guest' as const, id };
      })();
  const policy = subject.type === 'user'
    ? { allowance: USER_MONTHLY_AI_CREDITS, periodKey: calendarMonthPeriodKey() }
    : { allowance: GUEST_AI_CREDITS, periodKey: GUEST_PERIOD_KEY };

  const reservation = await meter.reserve({ subject, action, credits, policy });
  return { reservation, guestCookie, subjectType: subject.type };
}

export function attachGuestAICookie<T extends NextResponse>(
  response: T,
  gate?: HostedAICreditGate,
): T {
  if (gate?.guestCookie) {
    response.cookies.set(GUEST_COOKIE, gate.guestCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 365 * 24 * 60 * 60,
    });
  }
  return response;
}

export function creditUsageDetails(
  provider: string,
  model: string,
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  },
): AIUsageDetails {
  const inputTokens = usage?.promptTokens ?? usage?.inputTokens ?? 0;
  const outputTokens = usage?.completionTokens ?? usage?.outputTokens ?? 0;
  return {
    provider,
    model,
    inputTokens,
    outputTokens,
    totalTokens: usage?.totalTokens ?? inputTokens + outputTokens,
    costUsd: calculateTokenCostUsd(inputTokens, outputTokens, HOSTED_AI_PRICING),
  };
}

export function hostedAIConfig(request: NextRequest): {
  apiKey?: string;
  provider: string;
  model: string;
  hosted: boolean;
} {
  const userApiKey = request.headers.get('x-api-key') || undefined;
  if (userApiKey) {
    const provider = request.headers.get('x-provider') || 'openrouter';
    return {
      apiKey: userApiKey,
      provider,
      model: request.headers.get('x-model') || (provider === 'google' ? HOSTED_AI_MODEL : `google/${HOSTED_AI_MODEL}`),
      hosted: false,
    };
  }

  const googleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (googleKey) {
    return { apiKey: googleKey, provider: 'google', model: HOSTED_AI_MODEL, hosted: true };
  }
  return {
    apiKey: process.env.OPENROUTER_API_KEY,
    provider: 'openrouter',
    model: `google/${HOSTED_AI_MODEL}`,
    hosted: true,
  };
}

export function creditExhaustedBody(gate: HostedAICreditGate) {
  const globalLimit = gate.reservation.denialReason === 'global_limit';
  return {
    error: globalLimit
      ? 'Hosted AI is temporarily at its daily capacity. Please try again tomorrow.'
      : gate.subjectType === 'guest'
      ? `You have used all ${GUEST_AI_CREDITS} guest AI credits. Sign in for ${USER_MONTHLY_AI_CREDITS} credits each month.`
      : `You have used all ${USER_MONTHLY_AI_CREDITS} AI credits for this month.`,
    code: globalLimit ? 'AI_DAILY_CAP_REACHED' : 'AI_CREDITS_EXHAUSTED',
    allowance: gate.reservation.allowance,
    remaining: gate.reservation.remaining,
    subjectType: gate.subjectType,
  };
}
