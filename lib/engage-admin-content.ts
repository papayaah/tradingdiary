import type { EmailTemplate } from '@reactkits.dev/react-engage/admin';

/** Trading Diary email defaults supplied to the reusable Engage admin panel. */
export const tradingDiaryEngageTemplates: EmailTemplate[] = [
  {
    id: 'welcome',
    name: 'Welcome Email (New Signup)',
    subject: 'Welcome to Trading Diary!',
    htmlContent: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
  <h2 style="color: #3b82f6;">Welcome aboard, {{user_name}}! 🎉</h2>
  <p>Thank you for joining Trading Diary. We are excited to help you review and improve your trading.</p>
  <p>To get started:</p>
  <ul>
    <li>Import your broker executions</li>
    <li>Review your dashboard and trade replay</li>
    <li>Use Help &amp; Feedback whenever you have a question</li>
  </ul>
  <p style="color: #64748b; font-size: 13px; margin-top: 24px;">The Trading Diary Team</p>
</div>`,
  },
  {
    id: 'ticket_reply',
    name: 'Support Ticket Reply',
    subject: 'Re: [Trading Diary Support] {{ticket_subject}}',
    htmlContent: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
  <h3 style="color: #0f172a; margin-top: 0;">Trading Diary Support Update</h3>
  <p>Hello {{user_name}},</p>
  <div style="background: #f8fafc; padding: 14px; border-radius: 6px; font-size: 14px; color: #334155; margin: 16px 0;">
    {{reply_text}}
  </div>
  <p style="font-size: 12px; color: #94a3b8; margin-top: 24px;">If you have further questions, reply directly to this email.</p>
</div>`,
  },
  {
    id: 'newsletter',
    name: 'Product Update / Newsletter',
    subject: 'What’s New in Trading Diary',
    htmlContent: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
  <h2 style="color: #10b981; margin-top: 0;">Trading Diary Updates</h2>
  <p>Here is what we shipped based on your feedback:</p>
  <div style="background: #f1f5f9; padding: 14px; border-radius: 6px; font-size: 14px; margin: 16px 0;">
    {{broadcast_content}}
  </div>
  <p style="font-size: 11px; color: #94a3b8; margin-top: 24px;">You received this because you subscribed to Trading Diary updates.</p>
</div>`,
  },
];

export const tradingDiaryInitialBroadcastSubject = 'Trading Diary Product Updates';
