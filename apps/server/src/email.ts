import { createTransport } from 'nodemailer';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { MailConfig } from './config.js';

export class EmailDeliveryError extends Error {
  constructor() {
    super('Invio email non disponibile. Verificare il servizio SMTP e riprovare.');
    this.name = 'EmailDeliveryError';
  }
}

/** SMTP errors may contain credentials, recipients or token URLs: never propagate them. */
export function createEmailSender(config: MailConfig) {
  const delivery = new AsyncLocalStorage<{ failed: boolean }>();
  const transport = createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    // Authenticated SMTP must negotiate TLS before sending credentials. Mailpit has no auth.
    requireTLS: Boolean(config.credentials) && !config.secure,
    ...(config.credentials ? { auth: config.credentials } : {}),
    connectionTimeout: 5_000,
    greetingTimeout: 5_000,
    socketTimeout: 10_000,
    logger: false,
    debug: false,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return {
    async track<T>(operation: () => Promise<T>): Promise<{ result: T; failed: boolean }> {
      const status = { failed: false };
      const result = await delivery.run(status, operation);
      return { result, failed: status.failed };
    },
    async verify(): Promise<void> {
      try {
        await transport.verify();
      } catch {
        const status = delivery.getStore();
        if (status) status.failed = true;
        throw new EmailDeliveryError();
      }
    },
    async send(to: string, kind: 'verification' | 'reset' | 'invitation', url: string): Promise<void> {
      try {
        const result = await transport.sendMail({
          from: config.from,
          to,
          subject: kind === 'invitation' ? 'Nexus AI — Workspace invitation' : kind === 'verification' ? 'Nexus AI — Verify your email' : 'Nexus AI — Reset your password',
          text: kind === 'invitation'
            ? `You have been invited to collaborate in Nexus AI. Sign in with this email address to review and accept the invitation:\n\n${url}\n\nThe link expires in 72 hours and can be used once. If you did not expect this invitation, ignore this email.`
            : kind === 'verification'
            ? `Confirm your Nexus AI email address by opening this link:\n\n${url}\n\nThe link expires in one hour. If you did not create this account, ignore this email.`
            : `Reset your Nexus AI password by opening this link:\n\n${url}\n\nThe link expires in 15 minutes and can be used once. If you did not request this change, ignore this email.`,
        });
        if (result.rejected.length > 0 || result.accepted.length === 0) throw new EmailDeliveryError();
      } catch {
        const status = delivery.getStore();
        if (status) status.failed = true;
        throw new EmailDeliveryError();
      }
    },
    close(): void {
      transport.close();
    },
  };
}

export type EmailSender = ReturnType<typeof createEmailSender>;
