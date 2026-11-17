import assert from "node:assert/strict";
import test from "node:test";
import { BrevoEmailService, type BrevoEmailConfig } from "./email.service.js";

const API_KEY = "brevo-test-key-do-not-log";
const TOKEN = "verification-token-do-not-log";
const MESSAGE = {
  to: "person@example.com",
  verificationUrl: `https://app.example/verify-email#token=${TOKEN}`,
  expiresInMinutes: 60,
};
const CONFIG: BrevoEmailConfig = {
  apiKey: API_KEY,
  senderEmail: "no-reply@verifyaddress.ng",
  senderName: "VerifyAddress NG",
};

function mockResponse(status: number): Response {
  return { ok: status >= 200 && status < 300, status } as Response;
}

test("Brevo success uses the transactional endpoint, API-key header and expected payload", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const fetchMock: typeof fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedInit = init;
    return mockResponse(201);
  };
  const service = new BrevoEmailService(CONFIG, fetchMock);

  assert.deepEqual(await service.sendVerificationEmail(MESSAGE), { status: "sent" });
  assert.equal(capturedUrl, "https://api.brevo.com/v3/smtp/email");
  assert.equal(capturedInit?.method, "POST");
  const headers = new Headers(capturedInit?.headers);
  assert.equal(headers.get("api-key"), API_KEY);
  assert.equal(headers.get("content-type"), "application/json");
  assert.equal(headers.get("accept"), "application/json");

  const payload = JSON.parse(String(capturedInit?.body)) as {
    sender: { email: string; name: string };
    to: Array<{ email: string }>;
    subject: string;
    htmlContent: string;
    textContent: string;
  };
  assert.deepEqual(payload.sender, { email: "no-reply@verifyaddress.ng", name: "VerifyAddress NG" });
  assert.deepEqual(payload.to, [{ email: "person@example.com" }]);
  assert.match(payload.subject, /VerifyAddress NG/);
  assert.match(payload.htmlContent, /expires in 60 minutes/);
  assert.match(payload.htmlContent, /used only once/);
  assert.match(payload.textContent, /expires in 60 minutes/);
  assert.match(payload.textContent, /used only once/);
  assert.match(payload.htmlContent, /#token=verification-token-do-not-log/);
});

test("missing Brevo configuration returns not_configured without making a request", async () => {
  let called = false;
  const fetchMock: typeof fetch = async () => {
    called = true;
    return mockResponse(201);
  };
  const service = new BrevoEmailService({ apiKey: API_KEY }, fetchMock);

  assert.deepEqual(await service.sendVerificationEmail(MESSAGE), { status: "not_configured" });
  assert.equal(called, false);
});

test("Brevo authentication failures are not reported as sent", async () => {
  const service = new BrevoEmailService(CONFIG, async () => mockResponse(401));
  assert.deepEqual(await service.sendVerificationEmail(MESSAGE), { status: "failed" });
});

test("Brevo rate-limit and server failures are not reported as sent", async () => {
  for (const status of [429, 500, 503]) {
    const service = new BrevoEmailService(CONFIG, async () => mockResponse(status));
    assert.deepEqual(await service.sendVerificationEmail(MESSAGE), { status: "failed" });
  }
});

test("network failures return a safe failed result without throwing or logging secrets", async () => {
  const logged: string[] = [];
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalLog = console.log;
  console.error = (...values: unknown[]) => logged.push(values.join(" "));
  console.warn = (...values: unknown[]) => logged.push(values.join(" "));
  console.log = (...values: unknown[]) => logged.push(values.join(" "));

  try {
    const service = new BrevoEmailService(CONFIG, async () => {
      throw new Error(`request failed ${API_KEY} ${TOKEN}`);
    });
    const result = await service.sendVerificationEmail(MESSAGE);
    assert.deepEqual(result, { status: "failed" });
    const output = JSON.stringify({ result, logged });
    assert.equal(output.includes(API_KEY), false);
    assert.equal(output.includes(TOKEN), false);
  } finally {
    console.error = originalError;
    console.warn = originalWarn;
    console.log = originalLog;
  }
});
