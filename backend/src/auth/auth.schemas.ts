import { z } from "zod";

const emailSchema = z.string().trim().toLowerCase().email().max(254);
// bcrypt processes at most 72 UTF-8 bytes; rejecting longer inputs avoids
// silently hashing different passwords as the same value.
const newPasswordSchema = z
  .string()
  .min(12)
  .max(72)
  .refine((password) => Buffer.byteLength(password, "utf8") <= 72, {
    message: "Password must be at most 72 UTF-8 bytes",
  });
const loginPasswordSchema = z
  .string()
  .min(1)
  .max(72)
  .refine((password) => Buffer.byteLength(password, "utf8") <= 72, {
    message: "Password must be at most 72 UTF-8 bytes",
  });

// Never include `role` here: public registration cannot assign privileges.
export const registrationSchema = z
  .object({
    email: emailSchema,
    password: newPasswordSchema,
  })
  .strict();

export const loginSchema = z
  .object({
    email: emailSchema,
    password: loginPasswordSchema,
  })
  .strict();

const opaqueTokenSchema = z.string().min(32).max(512);

export const emailVerificationSchema = z
  .object({ token: opaqueTokenSchema })
  .strict();

export const resendVerificationSchema = z
  .object({ email: emailSchema })
  .strict();

export const passwordResetSchema = z
  .object({
    token: opaqueTokenSchema,
    password: newPasswordSchema,
  })
  .strict();

export const passwordChangeSchema = z
  .object({
    currentPassword: loginPasswordSchema,
    newPassword: newPasswordSchema,
  })
  .strict()
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: "New password must differ from current password",
    path: ["newPassword"],
  });

export type RegistrationInput = z.infer<typeof registrationSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type EmailVerificationInput = z.infer<typeof emailVerificationSchema>;
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;
export type PasswordResetInput = z.infer<typeof passwordResetSchema>;
export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;
