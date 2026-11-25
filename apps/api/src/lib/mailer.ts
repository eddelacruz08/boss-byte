import { createTransport, type Transporter } from 'nodemailer';
import { env } from '../config/env';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

let transporter: Transporter | undefined;

/** The SMTP transport, created on first use. Locally this points at Mailpit. */
function getTransporter(): Transporter {
  transporter ??= createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth:
      env.SMTP_USER && env.SMTP_PASSWORD
        ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
        : undefined,
  });
  return transporter;
}

/**
 * Sends an email now. Request handlers should not call this directly — use
 * `enqueueEmail` so that a slow or failing mail server costs a retry in the
 * worker rather than a slow or failed request.
 */
export async function sendMail(message: MailMessage): Promise<string> {
  const info = (await getTransporter().sendMail({ from: env.MAIL_FROM, ...message })) as {
    messageId: string;
  };
  return info.messageId;
}

/**
 * Resolves when the SMTP server accepts a connection (and the credentials, if any).
 *
 * @public Handy in a start-up or readiness check; nothing calls it by default.
 */
export async function verifyMailer(): Promise<void> {
  await getTransporter().verify();
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapes text for interpolation into an HTML email body. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => ESCAPES[character]!);
}
