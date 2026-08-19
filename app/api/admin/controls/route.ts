import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { db } from '@/lib/scanner/db';
import { serverWatch } from '@/lib/db/server/schema';
import { eq } from 'drizzle-orm';
import { evaluateJobId, getScanQueue, type ScanJob } from '@/lib/scanner/queue';
import {
  isEquitiesProvider,
  isGovernorScope,
  readScannerControl,
  writeCadenceOverride,
  writeEquitiesProvider,
  writeScannerControl,
} from '@/lib/scanner/control';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user || !isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const control = await readScannerControl();
  return NextResponse.json({
    success: true,
    control,
    providerAvailability: {
      auto: true,
      ibkr: Boolean(process.env.IBKR_GATEWAY_HOST) || process.env.IBKR_ENABLED === 'true',
      tiingo: Boolean(process.env.TIINGO_API_KEY),
      polygon: Boolean(process.env.POLYGON_API_KEY),
      yahoo: true,
    },
  });
}

export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user || !isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const action = body?.action;

    if (action === 'pause-scanner' || action === 'resume-scanner') {
      const control = await writeScannerControl(action === 'pause-scanner', session.user.email);
      return NextResponse.json({
        success: true,
        control,
        message: control.paused
          ? 'Scanner paused globally. In-flight work may finish; no new work will start.'
          : 'Scanner resumed globally.',
      });
    }

    if (action === 'set-equities-provider') {
      if (!isEquitiesProvider(body?.provider)) {
        return NextResponse.json({ success: false, error: 'Unsupported equities provider' }, { status: 400 });
      }
      const control = await writeEquitiesProvider(body.provider, session.user.email);
      return NextResponse.json({
        success: true,
        control,
        message: `Equities provider changed to ${body.provider}. Scanner workers will apply it shortly.`,
      });
    }

    if (action === 'set-cadence-override') {
      if (!isGovernorScope(body?.scope)) {
        return NextResponse.json({ success: false, error: 'Unknown provider scope' }, { status: 400 });
      }
      // seconds null / 0 clears the override and returns the scope to the governor.
      const rawSeconds = body?.seconds;
      let seconds: number | null;
      if (rawSeconds === null || rawSeconds === undefined || rawSeconds === '') {
        seconds = null;
      } else {
        seconds = Number(rawSeconds);
        if (!Number.isFinite(seconds) || seconds < 0) {
          return NextResponse.json({ success: false, error: 'Cadence must be a positive number of seconds' }, { status: 400 });
        }
        if (seconds === 0) seconds = null;
      }
      const control = await writeCadenceOverride(body.scope, seconds, session.user.email);
      return NextResponse.json({
        success: true,
        control,
        message: seconds === null
          ? `Cadence override cleared for ${body.scope}; governor resumes control shortly.`
          : `Cadence override set to ${seconds}s for ${body.scope}; scanner applies it within ~30s.`,
      });
    }

    if (action === 'trigger-scan-all') {
      const control = await readScannerControl();
      if (control.paused) {
        return NextResponse.json({ success: false, error: 'Scanner is globally paused.' }, { status: 409 });
      }
      const watches = await db
        .select({ id: serverWatch.id })
        .from(serverWatch)
        .where(eq(serverWatch.enabled, true));
      const atSeconds = Math.floor(Date.now() / 1000);
      const queue = getScanQueue();
      await Promise.all(watches.map((watch) => {
        const job: ScanJob = { watchId: watch.id, scheduledFor: atSeconds, mode: 'evaluate' };
        return queue.add('evaluate', job, {
          jobId: evaluateJobId(watch.id, atSeconds),
          removeOnComplete: 1000,
          removeOnFail: 5000,
          attempts: 1,
        });
      }));
      return NextResponse.json({
        success: true,
        message: `Queued ${watches.length} cache-only evaluations. Provider acquisition was not accelerated.`,
      });
    }

    return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Control action failed' },
      { status: 500 }
    );
  }
}
