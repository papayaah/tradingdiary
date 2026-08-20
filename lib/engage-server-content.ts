import type { EngageEmailContent } from '@reactkits.dev/react-engage/server';

export const tradingDiaryEngageEmailContent: EngageEmailContent = {
  adminRecipientName: 'Trading Diary Support Admin',
  renderReply: ({ replyText }) => ({
    subject: '[Trading Diary Support] Ticket Update',
    htmlContent: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
  <h3 style="color: #3b82f6; margin-top: 0;">Trading Diary Support Reply</h3>
  <div style="background: #f8fafc; padding: 14px; border-radius: 6px; font-size: 14px; margin: 16px 0;">${replyText}</div>
  <p style="font-size: 12px; color: #94a3b8; margin-top: 24px;">Reply directly to this email if you have further questions.</p>
</div>`,
  }),
  renderWelcome: () => ({
    subject: 'Welcome to Trading Diary Updates!',
    htmlContent: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
  <h2 style="color: #3b82f6; margin-top: 0;">Welcome to Trading Diary Updates</h2>
  <p>Thank you for subscribing. We will send you product releases, workflow tips, and important service updates.</p>
</div>`,
  }),
  renderBroadcast: ({ subject, content, unsubscribeUrl }) => ({
    subject,
    htmlContent: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
  <h2 style="color: #10b981; margin-top: 0;">Trading Diary Updates</h2>
  <div style="background: #f8fafc; padding: 16px; border-radius: 6px; font-size: 14px; white-space: pre-wrap;">${content}</div>
  <p style="font-size: 11px; color: #94a3b8; margin-top: 24px; text-align: center;">
    Sent via Trading Diary · <a href="${unsubscribeUrl}" style="color: #94a3b8; text-decoration: underline;">Unsubscribe</a>
  </p>
</div>`,
  }),
  renderAdminNotification: ({ type, category, userEmail, message }) => ({
    subject: `[Trading Diary ${category}] New ${type} submission`,
    htmlContent: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
  <h2 style="color: #3b82f6; margin-top: 0;">New Trading Diary Support Submission</h2>
  <p><strong>Type:</strong> ${type} (${category})</p>
  <p><strong>User Email:</strong> ${userEmail}</p>
  <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 16px 0;" />
  <h4 style="margin-bottom: 8px;">Message:</h4>
  <p style="white-space: pre-wrap; background: #f8fafc; padding: 12px; border-radius: 6px; font-size: 14px;">${message}</p>
</div>`,
  }),
};
