import { randomUUID } from "node:crypto";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export const ACCESS_TOKEN_TYPE = "access" as const;
export const ACCESS_TOKEN_ISSUER = "verifyaddress-ng-api";
export const ACCESS_TOKEN_AUDIENCE = "verifyaddress-ng-client";
export const ACCESS_TOKEN_ALGORITHM = "HS256" as const;

export interface AccessTokenClaims extends JWTPayload {
  sub: string;
  iat: number;
  exp: number;
  jti: string;
  type: typeof ACCESS_TOKEN_TYPE;
}

export interface CreateAccessTokenInput {
  secret: string;
  subject: string;
  ttlSeconds: number;
  issuer?: string;
  audience?: string;
  now?: Date;
}

function secretBytes(secret: string): Uint8Array {
  const bytes = new TextEncoder().encode(secret);
  if (bytes.byteLength < 32) throw new Error("JWT access secret must be at least 32 bytes");
  return bytes;
}

export async function createAccessToken(input: CreateAccessTokenInput): Promise<string> {
  if (!Number.isSafeInteger(input.ttlSeconds) || input.ttlSeconds <= 0) {
    throw new Error("JWT access token lifetime must be a positive integer");
  }
  const issuedAt = Math.floor((input.now ?? new Date()).getTime() / 1000);
  return new SignJWT({ type: ACCESS_TOKEN_TYPE })
    .setProtectedHeader({ alg: ACCESS_TOKEN_ALGORITHM, typ: "JWT" })
    .setSubject(input.subject)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + input.ttlSeconds)
    .setIssuer(input.issuer ?? ACCESS_TOKEN_ISSUER)
    .setAudience(input.audience ?? ACCESS_TOKEN_AUDIENCE)
    .setJti(randomUUID())
    .sign(secretBytes(input.secret));
}

export interface VerifyAccessTokenOptions {
  secret: string;
  issuer?: string;
  audience?: string;
  currentDate?: Date;
}

export async function verifyAccessToken(token: string, options: VerifyAccessTokenOptions): Promise<AccessTokenClaims> {
  const { payload, protectedHeader } = await jwtVerify(token, secretBytes(options.secret), {
    algorithms: [ACCESS_TOKEN_ALGORITHM],
    issuer: options.issuer ?? ACCESS_TOKEN_ISSUER,
    audience: options.audience ?? ACCESS_TOKEN_AUDIENCE,
    currentDate: options.currentDate,
  });

  if (
    protectedHeader.alg !== ACCESS_TOKEN_ALGORITHM ||
    payload.type !== ACCESS_TOKEN_TYPE ||
    typeof payload.sub !== "string" || payload.sub.length === 0 ||
    typeof payload.iat !== "number" ||
    typeof payload.exp !== "number" ||
    typeof payload.jti !== "string" || payload.jti.length === 0
  ) {
    throw new Error("Invalid access token");
  }

  return payload as AccessTokenClaims;
}
