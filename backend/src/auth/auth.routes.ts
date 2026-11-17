import { Router, type RequestHandler } from "express";
import {
  emailVerificationSchema,
  loginSchema,
  registrationSchema,
  resendVerificationSchema,
} from "./auth.schemas.js";
import { env } from "../config/env.js";
import { AuthService } from "./auth.service.js";
import { MongoAuthRepository } from "./mongo.auth.repository.js";
import { emailService } from "./email.provider.js";
import { createRateLimit } from "../middleware/rateLimit.middleware.js";
import { loginRateLimit } from "./login-rate-limit.js";
import { AppError } from "../utils/AppError.js";

const router = Router();
const authService = new AuthService({
  repository: new MongoAuthRepository(),
  email: emailService,
  clientUrl: env.CLIENT_URL,
  verificationTtlMinutes: env.EMAIL_VERIFICATION_TTL_MINUTES,
  verificationResendCooldownSeconds: env.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS,
  accessTokenSecret: env.JWT_ACCESS_SECRET,
  accessTokenTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
});

const registrationLimit = createRateLimit({
  keyPrefix: "auth-register",
  windowMs: 15 * 60_000,
  maxRequests: 5,
});
const verificationLimit = createRateLimit({
  keyPrefix: "auth-verify-email",
  windowMs: 15 * 60_000,
  maxRequests: 10,
});
const resendLimit = createRateLimit({
  keyPrefix: "auth-resend-verification",
  windowMs: 15 * 60_000,
  maxRequests: 3,
});

function invalidInput(): AppError {
  return new AppError("Invalid request", 400);
}

const register: RequestHandler = async (req, res) => {
  const parsed = registrationSchema.safeParse(req.body);
  if (!parsed.success) throw invalidInput();

  const result = await authService.register(parsed.data.email, parsed.data.password);
  res.status(202).json(result);
};

const verifyEmail: RequestHandler = async (req, res) => {
  const parsed = emailVerificationSchema.safeParse(req.body);
  if (!parsed.success) throw invalidInput();

  const user = await authService.verifyEmail(parsed.data.token);
  res.status(200).json({ success: true, data: { user } });
};

const resendVerification: RequestHandler = async (req, res) => {
  const parsed = resendVerificationSchema.safeParse(req.body);
  if (!parsed.success) throw invalidInput();

  await authService.resendVerification(parsed.data.email);
  res.status(202).json({
    success: true,
    message: "Request accepted.",
  });
};

const login: RequestHandler = async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) throw invalidInput();

  const result = await authService.login(parsed.data.email, parsed.data.password);
  // Step 3.1 issues the token internally; a later cookie milestone will deliver it.
  res.status(200).json({ success: true, data: { user: result.user } });
};

router.post("/login", loginRateLimit, login);
router.post("/register", registrationLimit, register);
router.post("/verify-email", verificationLimit, verifyEmail);
router.post("/resend-verification", resendLimit, resendVerification);

export const authRouter = router;
