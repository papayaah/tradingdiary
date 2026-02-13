import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    return NextResponse.json({
        hasServerKey: !!process.env.OPENROUTER_API_KEY,
        provider: 'openrouter',
        model: 'google/gemini-2.0-flash-exp:free',
    });
}
