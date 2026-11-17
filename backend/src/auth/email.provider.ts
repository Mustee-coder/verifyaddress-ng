import { env } from "../config/env.js";
import { BrevoEmailService } from "./email.service.js";

export const emailService = new BrevoEmailService({
  apiKey: env.BREVO_API_KEY,
  senderEmail: env.BREVO_SENDER_EMAIL,
  senderName: env.BREVO_SENDER_NAME,
});

export const emailServiceConfigured = emailService.isConfigured;
