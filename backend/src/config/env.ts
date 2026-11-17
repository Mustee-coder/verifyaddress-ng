
import "dotenv/config";
import { z } from "zod";

const optionalBrevoString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().min(1).optional(),
);
const optionalBrevoEmail = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().email().optional(),
);

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  PORT: z.coerce.number().int().positive().default(5000),

  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),

  // Keep signing material outside source control. Use independently generated
  // values with at least 32 characters in each environment.
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  EMAIL_VERIFICATION_TTL_MINUTES: z.coerce.number().int().positive().default(60),
  EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(120),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(30),

  BREVO_API_KEY: optionalBrevoString,
  BREVO_SENDER_EMAIL: optionalBrevoEmail,
  BREVO_SENDER_NAME: optionalBrevoString,

  POSTCODE_API_KEY: z.string().min(1, "POSTCODE_API_KEY is required"),

  CLIENT_URL: z.string().url().default("http://localhost:5173"),
}).superRefine((values, context) => {
  const brevoSettings = [
    values.BREVO_API_KEY,
    values.BREVO_SENDER_EMAIL,
    values.BREVO_SENDER_NAME,
  ];
  const configuredCount = brevoSettings.filter(Boolean).length;

  if (configuredCount !== 0 && configuredCount !== brevoSettings.length) {
    context.addIssue({
      code: "custom",
      path: ["BREVO_API_KEY"],
      message: "BREVO_API_KEY, BREVO_SENDER_EMAIL, and BREVO_SENDER_NAME must be configured together",
    });
  }

  if (values.NODE_ENV === "production" && configuredCount === 0) {
    context.addIssue({
      code: "custom",
      path: ["BREVO_API_KEY"],
      message: "Brevo email settings are required in production",
    });
  }
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("Invalid environment configuration:");
  for (const issue of parsedEnv.error.issues) {
    const setting = issue.path.length > 0 ? issue.path.map(String).join(".") : "environment";
    console.error(`${setting}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsedEnv.data;
