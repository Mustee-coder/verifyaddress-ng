import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";
import { createRateLimit } from "./rateLimit.middleware.js";
import { LOGIN_RATE_LIMIT_OPTIONS } from "../auth/login-rate-limit.js";

test("rate limiter allows configured requests then responds 429", () => {
  let now = 1000;
  const limiter = createRateLimit({
    keyPrefix: "test",
    windowMs: 60_000,
    maxRequests: 2,
    now: () => now,
  });
  const statuses: number[] = [];
  const headers: Record<string, string> = {};
  let nextCount = 0;
  const req = { ip: "127.0.0.1", socket: { remoteAddress: "127.0.0.1" } } as Request;
  const res = {
    setHeader: (key: string, value: string) => { headers[key] = value; },
    status: (code: number) => { statuses.push(code); return res; },
    json: () => res,
  } as unknown as Response;
  const next = () => { nextCount += 1; };

  limiter(req, res, next);
  limiter(req, res, next);
  limiter(req, res, next);
  assert.equal(nextCount, 2);
  assert.deepEqual(statuses, [429]);
  assert.equal(Number(headers["Retry-After"]) > 0, true);

  now += 60_001;
  limiter(req, res, next);
  assert.equal(nextCount, 3);
});

test("login rate limit permits five attempts per IP per fifteen minute window", () => {
  assert.equal(LOGIN_RATE_LIMIT_OPTIONS.maxRequests, 5);
  assert.equal(LOGIN_RATE_LIMIT_OPTIONS.windowMs, 15 * 60_000);
  const limiter = createRateLimit({ ...LOGIN_RATE_LIMIT_OPTIONS, now: () => 1000 });
  const statuses: number[] = [];
  let nextCount = 0;
  const req = { ip: "192.0.2.10", socket: { remoteAddress: "192.0.2.10" } } as Request;
  const res = {
    setHeader: () => undefined,
    status: (code: number) => { statuses.push(code); return res; },
    json: () => res,
  } as unknown as Response;
  const next = () => { nextCount += 1; };

  for (let attempt = 0; attempt < 6; attempt += 1) limiter(req, res, next);
  assert.equal(nextCount, 5);
  assert.deepEqual(statuses, [429]);
});
