import assert from "node:assert/strict";
import test from "node:test";
import { SignJWT } from "jose";
import {
  ACCESS_TOKEN_AUDIENCE,
  ACCESS_TOKEN_ISSUER,
  createAccessToken,
  verifyAccessToken,
} from "./access-token.js";

const secret = "test-only-secret-with-at-least-32-bytes";
const now = new Date("2026-01-01T00:00:00.000Z");
const options = { secret, currentDate: now };

async function arbitraryToken(claims: Record<string, unknown>, overrides: {
  secret?: string; issuer?: string; audience?: string; expiresAt?: number;
  algorithm?: "HS256" | "HS384";
} = {}) {
  const issuedAt = Math.floor(now.getTime() / 1000);
  return new SignJWT(claims)
    .setProtectedHeader({ alg: overrides.algorithm ?? "HS256", typ: "JWT" })
    .setSubject("user-123")
    .setIssuedAt(issuedAt)
    .setExpirationTime(overrides.expiresAt ?? issuedAt + 900)
    .setIssuer(overrides.issuer ?? ACCESS_TOKEN_ISSUER)
    .setAudience(overrides.audience ?? ACCESS_TOKEN_AUDIENCE)
    .setJti("test-jti")
    .sign(new TextEncoder().encode(overrides.secret ?? secret));
}

test("issued access JWT has required claims and configured lifetime", async () => {
  const token = await createAccessToken({
    secret,
    subject: "user-123",
    ttlSeconds: 321,
    now,
  });
  const claims = await verifyAccessToken(token, options);
  assert.equal(claims.sub, "user-123");
  assert.equal(claims.iss, ACCESS_TOKEN_ISSUER);
  assert.equal(claims.aud, ACCESS_TOKEN_AUDIENCE);
  assert.equal(claims.type, "access");
  assert.equal(claims.iat, Math.floor(now.getTime() / 1000));
  assert.equal(claims.exp! - claims.iat!, 321);
  assert.ok(claims.jti);
});

test("access JWT signature verifies and a modified signature is rejected", async () => {
  const token = await createAccessToken({ secret, subject: "user-123", ttlSeconds: 900, now });
  assert.equal((await verifyAccessToken(token, options)).sub, "user-123");
  const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
  await assert.rejects(verifyAccessToken(tampered, options));
});

test("expired, wrong issuer, wrong audience and wrong token type are rejected", async () => {
  const valid = { type: "access" };
  await assert.rejects(verifyAccessToken(
    await arbitraryToken(valid, { expiresAt: Math.floor(now.getTime() / 1000) }), options,
  ));
  await assert.rejects(verifyAccessToken(
    await arbitraryToken(valid, { issuer: "other-issuer" }), options,
  ));
  await assert.rejects(verifyAccessToken(
    await arbitraryToken(valid, { audience: "other-audience" }), options,
  ));
  await assert.rejects(verifyAccessToken(
    await arbitraryToken({ type: "refresh" }), options,
  ));
  await assert.rejects(verifyAccessToken(
    await arbitraryToken({ type: "access" }, { algorithm: "HS384" }), options,
  ));
});

test("token creation rejects secrets shorter than 32 bytes and invalid lifetimes", async () => {
  await assert.rejects(createAccessToken({ secret: "too-short", subject: "user", ttlSeconds: 60, now }));
  await assert.rejects(createAccessToken({ secret, subject: "user", ttlSeconds: 0, now }));
});
