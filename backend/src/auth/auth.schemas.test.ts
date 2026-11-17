import assert from "node:assert/strict";
import test from "node:test";
import {
  emailVerificationSchema,
  loginSchema,
  passwordChangeSchema,
  passwordResetSchema,
  registrationSchema,
} from "./auth.schemas.js";

test("registration normalizes email and rejects role assignment", () => {
  assert.deepEqual(
    registrationSchema.parse({ email: " User@Example.COM ", password: "long-enough-password" }),
    { email: "user@example.com", password: "long-enough-password" },
  );
  assert.equal(
    registrationSchema.safeParse({
      email: "user@example.com",
      password: "long-enough-password",
      role: "super_admin",
    }).success,
    false,
  );
  assert.equal(
    registrationSchema.safeParse({
      email: "user@example.com",
      password: "😀".repeat(20),
    }).success,
    false,
  );
});

test("login, verification, reset and change schemas enforce their inputs", () => {
  assert.equal(loginSchema.safeParse({ email: "bad", password: "x" }).success, false);
  assert.equal(emailVerificationSchema.safeParse({ token: "short" }).success, false);
  assert.equal(passwordResetSchema.safeParse({ token: "x".repeat(32), password: "short" }).success, false);
  assert.equal(
    passwordChangeSchema.safeParse({
      currentPassword: "same-long-password",
      newPassword: "same-long-password",
    }).success,
    false,
  );
  assert.equal(
    passwordChangeSchema.safeParse({
      currentPassword: "old-password",
      newPassword: "new-long-password",
    }).success,
    true,
  );
});
