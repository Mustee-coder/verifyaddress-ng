import assert from "node:assert/strict";
import test from "node:test";
import { User } from "../models/User.js";
import { MongoAuthRepository } from "./mongo.auth.repository.js";

function mockUserModel(response: unknown, calls: unknown[][]): typeof User {
  const model = {
    findOne: (...args: unknown[]) => {
      calls.push(args);
      return { select: async (projection: string) => { calls.push([projection]); return response; } };
    },
    findOneAndUpdate: (...args: unknown[]) => {
      calls.push(args);
      return {
        lean: async () => response,
        select: async () => response,
      };
    },
  };
  return model as unknown as typeof User;
}

test("login lookup explicitly selects the hidden passwordHash", async () => {
  const calls: unknown[][] = [];
  const repository = new MongoAuthRepository(mockUserModel({ email: "user@example.com", passwordHash: "hash" }, calls));
  await repository.findLoginUser("user@example.com");
  assert.deepEqual(calls, [[{ email: "user@example.com" }], ["+passwordHash"]]);
});

test("resend claim atomically checks cooldown and replaces token in one Mongo update", async () => {
  const calls: unknown[][] = [];
  const repository = new MongoAuthRepository(mockUserModel({ _id: "user-id", email: "user@example.com" }, calls));
  const now = new Date("2026-01-01T00:00:00.000Z");
  const tokenExpiresAt = new Date("2026-01-01T01:00:00.000Z");
  const resendAllowedAt = new Date("2026-01-01T00:02:00.000Z");

  const claimed = await repository.claimResendVerification({
    email: "user@example.com",
    now,
    tokenHash: "hashed-new-token",
    tokenExpiresAt,
    resendAllowedAt,
  });

  assert.deepEqual(claimed, { id: "user-id", email: "user@example.com" });
  assert.equal(calls.length, 1);
  const [filter, update, options] = calls[0]! as [
    Record<string, unknown>,
    { $set: Record<string, unknown> },
    { new: boolean },
  ];
  assert.equal(filter.email, "user@example.com");
  assert.equal(filter.emailVerifiedAt, null);
  assert.deepEqual(filter.$or, [
    { verificationResendAllowedAt: null },
    { verificationResendAllowedAt: { $lte: now } },
  ]);
  assert.equal(update.$set.emailVerificationTokenHash, "hashed-new-token");
  assert.equal(update.$set.emailVerificationExpiresAt, tokenExpiresAt);
  assert.equal(update.$set.verificationResendAllowedAt, resendAllowedAt);
  assert.equal(options.new, true);
});

test("verification remains a single conditional update that unsets its token", async () => {
  const calls: unknown[][] = [];
  const repository = new MongoAuthRepository(mockUserModel(null, calls));
  const now = new Date("2026-01-01T00:00:00.000Z");

  await repository.consumeVerificationToken("stored-sha256-hash", now);

  assert.equal(calls.length, 1);
  const [filter, update] = calls[0]! as [
    Record<string, unknown>,
    { $set: Record<string, unknown>; $unset: Record<string, unknown> },
  ];
  assert.equal(filter.emailVerificationTokenHash, "stored-sha256-hash");
  assert.deepEqual(filter.emailVerificationExpiresAt, { $gt: now });
  assert.equal(filter.emailVerifiedAt, null);
  assert.equal(update.$set.emailVerifiedAt, now);
  assert.ok(update.$unset.emailVerificationTokenHash);
  assert.ok(update.$unset.emailVerificationExpiresAt);
});
