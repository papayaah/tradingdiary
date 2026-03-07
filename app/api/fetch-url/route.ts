import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    const url = request.nextUrl.searchParams.get('url');

    if (!url) {
        return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    try {
        const response = await fetch(url);
        if (!response.ok) {
            return NextResponse.json({ error: 'Failed to fetch the URL' }, { status: response.status });
        }

        const content = await response.text();
        return new NextResponse(content, {
            status: 200,
            headers: {
                'Content-Type': response.headers.get('Content-Type') || 'text/plain',
            },
        });
    } catch (error) {
        console.error('Error fetching URL:', error);
        return NextResponse.json({ error: 'Failed to fetch the URL' }, { status: 500 });
    }
}
