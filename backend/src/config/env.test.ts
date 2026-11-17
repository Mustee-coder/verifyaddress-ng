import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const envModuleUrl = new URL("./env.js", import.meta.url).href;
const baseEnv: NodeJS.ProcessEnv = {
  PATH: process.env.PATH ?? "",
  DOTENV_CONFIG_PATH: "/dev/null",
  MONGODB_URI: "mongodb://127.0.0.1/verifyaddress-test",
  JWT_ACCESS_SECRET: "test-only-jwt-secret-that-is-long-enough",
  POSTCODE_API_KEY: "test-only-postcode-key",
};

function runEnv(extra: NodeJS.ProcessEnv) {
  return spawnSync(
    process.execPath,
    ["--input-type=module", "-e", `await import(${JSON.stringify(envModuleUrl)})`],
    { env: { ...baseEnv, ...extra }, encoding: "utf8" },
  );
}

test("development environment may omit Brevo settings", () => {
  const result = runEnv({ NODE_ENV: "development" });
  assert.equal(result.status, 0, result.stderr);
});

test("production environment requires all Brevo settings and does not print values", () => {
  const result = runEnv({ NODE_ENV: "production" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Brevo email settings are required in production/);
  assert.equal(result.stderr.includes(baseEnv.JWT_ACCESS_SECRET!), false);
});

test("partial Brevo configuration is rejected without printing the API key", () => {
  const apiKey = "test-key-that-must-not-appear-in-errors";
  const result = runEnv({ NODE_ENV: "development", BREVO_API_KEY: apiKey });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /must be configured together/);
  assert.equal(result.stderr.includes(apiKey), false);
});

test("complete Brevo configuration is accepted in production", () => {
  const result = runEnv({
    NODE_ENV: "production",
    BREVO_API_KEY: "test-only-brevo-api-key",
    BREVO_SENDER_EMAIL: "no-reply@example.com",
    BREVO_SENDER_NAME: "VerifyAddress NG",
  });
  assert.equal(result.status, 0, result.stderr);
});
