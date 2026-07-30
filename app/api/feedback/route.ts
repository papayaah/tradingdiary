import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, payload } = body;

    console.log(`[Feedback API] Received ${type} submission from app: ${payload?.appId || 'unknown'}`);
    console.log(JSON.stringify({ type, payload }, null, 2));

    const brevoApiKey = process.env.BREVO_API_KEY;
    const recipientEmail = process.env.FEEDBACK_RECIPIENT_EMAIL || 'hello@tradingdiary.app';

    // If BREVO_API_KEY is configured in .env, dispatch transactional email notification
    if (brevoApiKey && payload) {
      const categoryLabel = payload.category ? String(payload.category).toUpperCase() : 'GENERAL';
      const userEmail = payload.email || payload.user?.email || 'Anonymous / Not provided';
      const userMessage = payload.message || payload.description || payload.subject || 'No message provided';

      const emailSubject = `[Trading Diary ${categoryLabel}] New ${type} submission`;
      
      const htmlBody = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; rounded-lg: 8px;">
          <h2 style="color: #3b82f6; margin-top: 0;">New Feedback / Support Ticket</h2>
          <p><strong>Type:</strong> ${type} (${categoryLabel})</p>
          <p><strong>User Email:</strong> ${userEmail}</p>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 16px 0;" />
          <h4 style="margin-bottom: 8px;">Message / Description:</h4>
          <p style="white-space: pre-wrap; background: #f8fafc; padding: 12px; border-radius: 6px; font-size: 14px;">${userMessage}</p>
          ${payload.environment ? `
            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 16px 0;" />
            <h4 style="margin-bottom: 8px;">Environment Metadata:</h4>
            <ul style="font-size: 12px; color: #64748b;">
              <li><strong>URL:</strong> ${payload.environment.path || 'N/A'}</li>
              <li><strong>Browser:</strong> ${payload.environment.browser || 'N/A'}</li>
              <li><strong>OS:</strong> ${payload.environment.os || 'N/A'}</li>
              <li><strong>Screen:</strong> ${payload.environment.screenResolution || 'N/A'}</li>
            </ul>
          ` : ''}
          <p style="font-size: 11px; color: #94a3b8; margin-top: 24px;">Sent from Trading Diary feedback widget via Brevo API.</p>
        </div>
      `;

      const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'content-type': 'application/json',
          'api-key': brevoApiKey,
        },
        body: JSON.stringify({
          sender: { name: 'Trading Diary Support', email: 'hello@tradingdiary.app' },
          to: [{ email: recipientEmail, name: 'Support Admin' }],
          replyTo: payload.email ? { email: payload.email } : undefined,
          subject: emailSubject,
          htmlContent: htmlBody,
        }),
      });

      if (!brevoRes.ok) {
        const errorText = await brevoRes.text();
        console.error('[Brevo API Error]:', brevoRes.status, errorText);
      } else {
        console.log('[Brevo API Success]: Email dispatched to', recipientEmail);
      }
    }

    return NextResponse.json({ success: true, receivedAt: new Date().toISOString() });
  } catch (error) {
    console.error('[Feedback API Error]:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process feedback submission' },
      { status: 500 }
    );
  }
}
