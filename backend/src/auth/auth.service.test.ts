import assert from "node:assert/strict";
import test from "node:test";
import { AuthService, type AuthRepository, type NewUserData } from "./auth.service.js";
import { hashVerificationToken, verifyPassword } from "./auth.crypto.js";
import type { SafeUserDTO, UserDTOFields } from "./user.dto.js";
import type { EmailDeliveryResult, EmailService, VerificationEmail } from "./email.service.js";
import type { VerificationDeliveryEvent } from "./auth.service.js";

interface StoredUser extends UserDTOFields {
  id: string;
  passwordHash: string;
  emailVerificationTokenHash: string | undefined;
  emailVerificationExpiresAt: Date | undefined;
  verificationResendAllowedAt: Date | null;
  isActive: boolean;
}

class MemoryRepository implements AuthRepository {
  readonly users = new Map<string, StoredUser>();
  resendClaimAttempts = 0;
  resendClaimSuccesses = 0;
  tokenReplacements = 0;
  private nextId = 1;

  async findLoginUser(email: string) {
    return this.users.get(email) ?? null;
  }

  async createUser(data: NewUserData): Promise<UserDTOFields> {
    if (this.users.has(data.email)) throw Object.assign(new Error("duplicate"), { code: 11000 });
    const now = new Date("2026-01-01T00:00:00.000Z");
    const user: StoredUser = {
      id: String(this.nextId++),
      _id: String(this.nextId),
      email: data.email,
      passwordHash: data.passwordHash,
      role: data.role,
      emailVerifiedAt: null,
      emailVerificationTokenHash: data.emailVerificationTokenHash,
      emailVerificationExpiresAt: data.emailVerificationExpiresAt,
      verificationResendAllowedAt: null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(user.email, user);
    return this.publicFields(user);
  }

  async claimResendVerification(input: {
    email: string;
    now: Date;
    tokenHash: string;
    tokenExpiresAt: Date;
    resendAllowedAt: Date;
  }): Promise<{ id: string; email: string } | null> {
    this.resendClaimAttempts += 1;
    const user = this.users.get(input.email);
    if (
      !user ||
      user.emailVerifiedAt ||
      (user.verificationResendAllowedAt && user.verificationResendAllowedAt > input.now)
    ) return null;

    // This synchronous compare-and-set models one atomic MongoDB update.
    user.emailVerificationTokenHash = input.tokenHash;
    user.emailVerificationExpiresAt = input.tokenExpiresAt;
    user.verificationResendAllowedAt = input.resendAllowedAt;
    this.resendClaimSuccesses += 1;
    this.tokenReplacements += 1;
    return { id: user.id, email: user.email };
  }

  async consumeVerificationToken(tokenHash: string, now: Date): Promise<UserDTOFields | null> {
    const user = [...this.users.values()].find((candidate) =>
      candidate.emailVerificationTokenHash === tokenHash &&
      candidate.emailVerificationExpiresAt !== undefined &&
      candidate.emailVerificationExpiresAt > now &&
      !candidate.emailVerifiedAt,
    );
    if (!user) return null;
    // Synchronous mutation models the atomic MongoDB findOneAndUpdate condition.
    user.emailVerifiedAt = now;
    user.emailVerificationTokenHash = undefined;
    user.emailVerificationExpiresAt = undefined;
    return this.publicFields(user);
  }

  private publicFields(user: StoredUser): UserDTOFields {
    return {
      _id: user._id,
      email: user.email,
      role: user.role,
      emailVerifiedAt: user.emailVerifiedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}

class CaptureEmail implements EmailService {
  readonly messages: VerificationEmail[] = [];
  constructor(private readonly result: EmailDeliveryResult = { status: "sent" }) {}
  async sendVerificationEmail(message: VerificationEmail) {
    this.messages.push(message);
    return this.result;
  }
}

function setup(
  tokens = ["A".repeat(43), "B".repeat(43)],
  emailResult: EmailDeliveryResult = { status: "sent" },
) {
  const repository = new MemoryRepository();
  const email = new CaptureEmail(emailResult);
  const deliveryEvents: VerificationDeliveryEvent[] = [];
  let tokenIndex = 0;
  const service = new AuthService({
    repository,
    accessTokenSecret: "test-only-secret-with-at-least-32-bytes",
    accessTokenTtlSeconds: 900,
    email,
    clientUrl: "https://verify.example",
    verificationTtlMinutes: 60,
    verificationResendCooldownSeconds: 120,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    createToken: () => tokens[tokenIndex++] ?? "C".repeat(43),
    reportDelivery: (event) => deliveryEvents.push(event),
  });
  return { service, repository, email, deliveryEvents };
}

test("login normalizes email, verifies bcrypt password and returns safe user with access token", async () => {
  const state = setup();
  await register(state);
  await state.service.verifyEmail(tokenFrom(state.email));
  const stored = state.repository.users.get("user@example.com")!;
  stored.passwordHash = await import("./auth.crypto.js").then(({ hashPassword }) => hashPassword("correct-password"));
  let tokenInput: { subject: string; ttlSeconds: number } | undefined;
  const logged: unknown[][] = [];
  const originalInfo = console.info;
  const originalWarn = console.warn;
  console.info = (...values: unknown[]) => { logged.push(values); };
  console.warn = (...values: unknown[]) => { logged.push(values); };
  const loginService = new AuthService({
    repository: state.repository,
    email: state.email,
    clientUrl: "https://verify.example",
    verificationTtlMinutes: 60,
    accessTokenSecret: "test-only-secret-with-at-least-32-bytes",
    accessTokenTtlSeconds: 321,
    issueAccessToken: async ({ subject, ttlSeconds }) => {
      tokenInput = { subject, ttlSeconds };
      return "private-access-token";
    },
  });

  let result;
  try {
    result = await loginService.login(" USER@Example.COM ", "correct-password");
  } finally {
    console.info = originalInfo;
    console.warn = originalWarn;
  }
  assert.equal(result.user.email, "user@example.com");
  assert.equal(result.user.emailVerified, true);
  assert.equal(result.accessToken, "private-access-token");
  assert.equal(tokenInput?.subject, stored._id);
  assert.equal(tokenInput?.ttlSeconds, 321);
  assert.equal(JSON.stringify(result.user).includes(stored.passwordHash), false);
  assert.equal(JSON.stringify(logged).includes("private-access-token"), false);
  assert.equal(JSON.stringify(logged).includes("test-only-secret-with-at-least-32-bytes"), false);
  assert.equal(stored.role, "individual_user");
});

test("login gives the same generic authentication failure for all ineligible credentials", async () => {
  const state = setup();
  await register(state);
  const stored = state.repository.users.get("user@example.com")!;
  stored.passwordHash = await import("./auth.crypto.js").then(({ hashPassword }) => hashPassword("correct-password"));

  for (const [email, password, mutate] of [
    ["missing@example.com", "correct-password", () => {}],
    ["user@example.com", "wrong-password", () => {}],
    ["user@example.com", "correct-password", () => { stored.emailVerifiedAt = null; }],
    ["user@example.com", "correct-password", () => { stored.emailVerifiedAt = new Date(); stored.isActive = false; }],
  ] as const) {
    mutate();
    await assert.rejects(state.service.login(email, password), (error: unknown) => {
      assert.equal((error as { statusCode: number }).statusCode, 401);
      assert.equal((error as Error).message, "Invalid email or password");
      return true;
    });
    stored.emailVerifiedAt = null;
    stored.isActive = true;
  }
});

async function register(setupResult: ReturnType<typeof setup>, email = " USER@Example.COM "): Promise<void> {
  await setupResult.service.register(email, "a-long-password-123");
}

function tokenFrom(email: CaptureEmail, index = 0): string {
  const url = new URL(email.messages[index]!.verificationUrl);
  return new URLSearchParams(url.hash.slice(1)).get("token")!;
}

test("registration hashes passwords, normalizes email and always sets individual role", async () => {
  const state = setup();
  const response = await state.service.register(" User@Example.COM ", "a-long-password-123");
  const stored = state.repository.users.get("user@example.com")!;
  assert.equal(response.success, true);
  assert.equal(stored.email, "user@example.com");
  assert.equal(stored.role, "individual_user");
  assert.notEqual(stored.passwordHash, "a-long-password-123");
  assert.equal(await verifyPassword("a-long-password-123", stored.passwordHash), true);
  assert.equal("a-long-password-123" in stored, false);
  assert.equal(JSON.stringify(response).includes(stored.passwordHash), false);
});

test("registration handles accepted, not-configured and failed delivery with the same public response", async () => {
  const cases = [
    { result: { status: "sent" } as const, outcome: "provider_accepted" },
    { result: { status: "not_configured" } as const, outcome: "not_configured" },
    { result: { status: "failed" } as const, outcome: "failed" },
  ];

  for (const { result, outcome } of cases) {
    const state = setup(undefined, result);
    const response = await state.service.register("user@example.com", "a-long-password-123");
    assert.deepEqual(response, { success: true, message: "Request accepted." });
    assert.deepEqual(state.deliveryEvents, [{
      event: "verification_email_delivery",
      flow: "registration",
      outcome,
    }]);
  }
});

test("duplicate registration returns the same generic response and does not replace account", async () => {
  const state = setup();
  await register(state, "user@example.com");
  const firstHash = state.repository.users.get("user@example.com")!.passwordHash;
  const firstResponse = await state.service.register("USER@example.com", "another-long-password");
  const duplicateResponse = await state.service.register("user@example.com", "another-long-password");
  assert.deepEqual(duplicateResponse, firstResponse);
  assert.equal(state.repository.users.size, 1);
  assert.equal(state.repository.users.get("user@example.com")!.passwordHash, firstHash);
  assert.equal(state.email.messages.length, 1);
});

test("verification tokens are random, persisted as hashes, and never included in registration response", async () => {
  const state = setup();
  const response = await state.service.register("user@example.com", "a-long-password-123");
  const token = tokenFrom(state.email);
  const stored = state.repository.users.get("user@example.com")!;
  assert.equal(token.length >= 43, true);
  assert.equal(stored.emailVerificationTokenHash, hashVerificationToken(token));
  assert.notEqual(stored.emailVerificationTokenHash, token);
  assert.equal(JSON.stringify(response).includes(token), false);
});

test("verification succeeds once, sets timestamp and clears stored token", async () => {
  const state = setup();
  await register(state, "user@example.com");
  const token = tokenFrom(state.email);
  const dto = await state.service.verifyEmail(token);
  assert.equal(dto.emailVerified, true);
  const stored = state.repository.users.get("user@example.com")!;
  assert.equal(stored.emailVerifiedAt?.toISOString(), "2026-01-01T00:00:00.000Z");
  assert.equal(stored.emailVerificationTokenHash, undefined);
  assert.equal(JSON.stringify(dto).includes("passwordHash"), false);
  await assert.rejects(state.service.verifyEmail(token), /invalid or expired/);
});

test("invalid and expired verification tokens are rejected", async () => {
  const state = setup();
  await register(state, "user@example.com");
  await assert.rejects(state.service.verifyEmail("D".repeat(43)), /invalid or expired/);
  state.repository.users.get("user@example.com")!.emailVerificationExpiresAt = new Date("2025-12-31T23:59:59Z");
  await assert.rejects(state.service.verifyEmail(tokenFrom(state.email)), /invalid or expired/);
});

test("concurrent verification consumes a token only once", async () => {
  const state = setup();
  await register(state, "user@example.com");
  const token = tokenFrom(state.email);
  const outcomes = await Promise.allSettled([
    state.service.verifyEmail(token),
    state.service.verifyEmail(token),
  ]);
  assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter((outcome) => outcome.status === "rejected").length, 1);
});

test("resend replaces the old token and only the newest token verifies", async () => {
  const state = setup(["A".repeat(43), "B".repeat(43)]);
  await register(state, "user@example.com");
  const oldToken = tokenFrom(state.email, 0);
  await state.service.resendVerification(" USER@example.com ");
  const newToken = tokenFrom(state.email, 1);
  assert.notEqual(oldToken, newToken);
  assert.equal(state.repository.users.get("user@example.com")!.emailVerificationTokenHash, hashVerificationToken(newToken));
  await assert.rejects(state.service.verifyEmail(oldToken), /invalid or expired/);
  assert.equal((await state.service.verifyEmail(newToken)).emailVerified, true);
});

test("simultaneous resends for one account replace the token and send only once", async () => {
  const state = setup();
  await register(state, "user@example.com");
  state.email.messages.length = 0;
  state.repository.tokenReplacements = 0;
  state.repository.resendClaimAttempts = 0;
  state.repository.resendClaimSuccesses = 0;

  await Promise.all([
    state.service.resendVerification("user@example.com"),
    state.service.resendVerification("USER@example.com"),
  ]);

  assert.equal(state.repository.resendClaimAttempts, 2);
  assert.equal(state.repository.resendClaimSuccesses, 1);
  assert.equal(state.repository.tokenReplacements, 1);
  assert.equal(state.email.messages.length, 1);
  const savedHash = state.repository.users.get("user@example.com")!.emailVerificationTokenHash;
  assert.equal(savedHash, hashVerificationToken(tokenFrom(state.email)));
});

test("different accounts can claim resend cooldown independently", async () => {
  const state = setup(["A".repeat(43), "B".repeat(43), "C".repeat(43), "D".repeat(43)]);
  await register(state, "one@example.com");
  await register(state, "two@example.com");
  state.email.messages.length = 0;

  await Promise.all([
    state.service.resendVerification("one@example.com"),
    state.service.resendVerification("two@example.com"),
  ]);

  assert.equal(state.repository.resendClaimSuccesses, 2);
  assert.equal(state.repository.tokenReplacements, 2);
  assert.equal(state.email.messages.length, 2);
});

test("safe verification DTO contains no password or token hashes", async () => {
  const state = setup();
  await register(state, "user@example.com");
  const response: SafeUserDTO = await state.service.verifyEmail(tokenFrom(state.email));
  const serialized = JSON.stringify(response);
  for (const secretField of ["passwordHash", "emailVerificationTokenHash", "passwordResetTokenHash"]) {
    assert.equal(serialized.includes(secretField), false);
  }
});
