import assert from "node:assert/strict";
import test from "node:test";
import { Types } from "mongoose";
import { Session } from "./Session.js";
import { User } from "./User.js";

test("User defaults role, normalizes email, and strips credential fields on serialization", () => {
  const user = new User({
    email: " User@Example.COM ",
    passwordHash: "password-hash",
    emailVerificationTokenHash: "verification-hash",
    passwordResetTokenHash: "reset-hash",
  });
  assert.equal(user.role, "individual_user");
  assert.equal(user.email, "user@example.com");
  const json = JSON.stringify(user);
  assert.equal(json.includes("password-hash"), false);
  assert.equal(json.includes("verification-hash"), false);
  assert.equal(json.includes("reset-hash"), false);
});

test("User role and unique email indexes are declared", () => {
  assert.deepEqual(User.schema.path("role")?.options.enum, [
    "individual_user",
    "business_owner",
    "business_staff",
    "super_admin",
  ]);
  assert.equal(User.schema.indexes().some(([keys, options]) => keys.email === 1 && options.unique), true);
});

test("Session strips refresh token hashes and declares unique token and expiry indexes", () => {
  const session = new Session({
    userId: new Types.ObjectId(),
    refreshTokenHash: "refresh-hash",
    expiresAt: new Date(Date.now() + 60_000),
  });
  assert.equal(JSON.stringify(session).includes("refresh-hash"), false);
  const indexes = Session.schema.indexes();
  assert.equal(indexes.some(([keys, options]) => keys.refreshTokenHash === 1 && options.unique), true);
  assert.equal(indexes.some(([keys, options]) => keys.expiresAt === 1 && options.expireAfterSeconds === 0), true);
});
