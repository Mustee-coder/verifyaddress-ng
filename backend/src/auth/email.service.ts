export interface VerificationEmail {
  to: string;
  verificationUrl: string;
  expiresInMinutes: number;
}

export type EmailDeliveryResult =
  | { status: "sent" }
  | { status: "not_configured" }
  | { status: "failed" };

/** Provider boundary. Implementations must not log message URLs or tokens. */
export interface EmailService {
  sendVerificationEmail(message: VerificationEmail): Promise<EmailDeliveryResult>;
}

export interface BrevoEmailConfig {
  apiKey?: string;
  senderEmail?: string;
  senderName?: string;
}

interface BrevoEmailPayload {
  sender: { email: string; name: string };
  to: Array<{ email: string }>;
  subject: string;
  htmlContent: string;
  textContent: string;
}

const BREVO_EMAIL_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
const REQUEST_TIMEOUT_MS = 10_000;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

function verificationPayload(message: VerificationEmail, config: BrevoEmailConfig): BrevoEmailPayload {
  const safeUrl = escapeHtml(message.verificationUrl);
  const safeName = escapeHtml(config.senderName!.trim());
  const safeExpiry = String(message.expiresInMinutes);

  return {
    sender: {
      email: config.senderEmail!.trim(),
      name: config.senderName!.trim(),
    },
    to: [{ email: message.to }],
    subject: "Verify your VerifyAddress NG email address",
    htmlContent: [
      '<!doctype html><html lang="en"><body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#172033">',
      '<main style="max-width:600px;margin:32px auto;padding:32px;background:#fff;border-radius:12px">',
      '<p style="font-size:13px;font-weight:bold;letter-spacing:.08em;color:#2563eb">VERIFYADDRESS NG</p>',
      '<h1 style="font-size:24px">Verify your email address</h1>',
      '<p>Thanks for creating a VerifyAddress NG account. Confirm this email address to finish setting up your account.</p>',
      `<p style="margin:28px 0"><a href="${safeUrl}" style="background:#2563eb;color:#fff;padding:13px 20px;border-radius:7px;text-decoration:none">Verify email address</a></p>`,
      `<p>This link expires in ${safeExpiry} minutes and can be used only once.</p>`,
      `<p style="font-size:13px;color:#526078">If the button does not work, copy this link into your browser:<br><a href="${safeUrl}">${safeUrl}</a></p>`,
      `<p style="font-size:13px;color:#526078">Sent by ${safeName}. If you did not create this account, you can ignore this message.</p>`,
      '</main></body></html>',
    ].join(""),
    textContent: [
      "Verify your VerifyAddress NG email address",
      "",
      "Thanks for creating a VerifyAddress NG account. Confirm this email address to finish setting up your account.",
      "",
      `Verify your email address: ${message.verificationUrl}`,
      `This link expires in ${safeExpiry} minutes and can be used only once.`,
      "",
      `Sent by ${config.senderName!.trim()}. If you did not create this account, you can ignore this message.`,
    ].join("\n"),
  };
}

/** Brevo's transactional email HTTP API; no SDK or credential logging. */
export class BrevoEmailService implements EmailService {
  constructor(
    private readonly config: BrevoEmailConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  get isConfigured(): boolean {
    return Boolean(
      this.config.apiKey?.trim() &&
      this.config.senderEmail?.trim() &&
      this.config.senderName?.trim(),
    );
  }

  async sendVerificationEmail(message: VerificationEmail): Promise<EmailDeliveryResult> {
    if (!this.isConfigured) return { status: "not_configured" };

    const payload = verificationPayload(message, this.config);
    try {
      const response = await this.fetchImpl(BREVO_EMAIL_ENDPOINT, {
        method: "POST",
        headers: {
          "api-key": this.config.apiKey!.trim(),
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      return response.ok ? { status: "sent" } : { status: "failed" };
    } catch {
      // Do not expose fetch errors, which may contain request details.
      return { status: "failed" };
    }
  }
}
