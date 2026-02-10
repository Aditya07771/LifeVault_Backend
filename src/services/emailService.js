import nodemailer from 'nodemailer';

/**
 * Email service (optional).
 * If SMTP env vars are not set, emails are skipped (no hard failure).
 *
 * Env supported:
 * - SMTP_HOST, SMTP_PORT, SMTP_SECURE ("true"/"false")
 * - SMTP_USER, SMTP_PASS
 * - EMAIL_FROM
 */
class EmailService {
  constructor() {
    this.transporter = null;
  }

  getTransporter() {
    if (this.transporter) return this.transporter;

    const host = process.env.SMTP_HOST;
    const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const secure = (process.env.SMTP_SECURE || '').toLowerCase() === 'true';

    if (!host || !port || !user || !pass) {
      return null;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass }
    });

    return this.transporter;
  }

  async sendQuestCompletionEmail({ to, userName, questTitle, rewards }) {
    const transporter = this.getTransporter();
    if (!transporter) {
      console.warn('ℹ️  Email not sent (SMTP not configured)');
      return { success: false, skipped: true };
    }

    const from = process.env.EMAIL_FROM || process.env.SMTP_USER;
    const subject = `Congratulations! You completed: ${questTitle}`;

    const apt = rewards?.apt?.amount || rewards?.aptAmount || 0;
    const points = rewards?.points?.pointsAdded || rewards?.points || 0;
    const xp = rewards?.xp ? 'XP updated' : '';

    const text = [
      `Hi ${userName || 'there'},`,
      '',
      `Congratulations! You successfully completed the quest: ${questTitle}`,
      '',
      `Rewards:`,
      `- APT: ${apt}`,
      `- Points: ${points}`,
      xp ? `- ${xp}` : null,
      '',
      `Thank you for contributing and being part of LifeVault.`,
      '',
      `— LifeVault Team`
    ]
      .filter(Boolean)
      .join('\n');

    const html = `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system; line-height: 1.5;">
        <h2 style="margin:0 0 12px;">🎉 Congratulations${userName ? `, ${userName}` : ''}!</h2>
        <p style="margin:0 0 8px;">You successfully completed:</p>
        <div style="padding:12px 14px;border:1px solid #e5e7eb;border-radius:12px;background:#f9fafb;">
          <strong>${questTitle}</strong>
        </div>
        <h3 style="margin:16px 0 8px;">Rewards</h3>
        <ul style="margin:0 0 12px; padding-left: 18px;">
          <li><strong>APT</strong>: ${apt}</li>
          <li><strong>Points</strong>: ${points}</li>
        </ul>
        <p style="margin:0;">Thank you for contributing.</p>
        <p style="margin:12px 0 0; color:#6b7280; font-size:12px;">— LifeVault Team</p>
      </div>
    `;

    await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html
    });

    return { success: true };
  }
}

export default new EmailService();

