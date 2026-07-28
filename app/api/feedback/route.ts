import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, payload } = body;

    console.log(`[Feedback API] Received ${type} submission from app: ${payload?.appId || 'unknown'}`);
    console.log(JSON.stringify({ type, payload }, null, 2));

    // Here you can integrate with Slack/Discord webhooks, GitHub Issues, or database storage (e.g. Drizzle/Postgres)
    
    return NextResponse.json({ success: true, receivedAt: new Date().toISOString() });
  } catch (error) {
    console.error('[Feedback API Error]:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process feedback submission' },
      { status: 500 }
    );
  }
}
