import { AppError } from "../utils/AppError.js";
import { toSafeUserDTO, type SafeUserDTO, type UserDTOFields } from "./user.dto.js";
import { createVerificationToken, hashPassword, hashVerificationToken, verifyPassword } from "./auth.crypto.js";
import type { EmailDeliveryResult, EmailService } from "./email.service.js";
import type { LoginUserFields } from "./user.dto.js";
import { ACCESS_TOKEN_AUDIENCE, ACCESS_TOKEN_ISSUER, createAccessToken } from "./access-token.js";

export interface NewUserData {
  email: string;
  passwordHash: string;
  role: "individual_user";
  emailVerificationTokenHash: string;
  emailVerificationExpiresAt: Date;
}

export interface AuthRepository {
  findLoginUser(email: string): Promise<LoginUserFields | null>;
  createUser(data: NewUserData): Promise<UserDTOFields>;
  claimResendVerification(input: {
    email: string;
    now: Date;
    tokenHash: string;
    tokenExpiresAt: Date;
    resendAllowedAt: Date;
  }): Promise<{ id: string; email: string } | null>;
  consumeVerificationToken(tokenHash: string, now: Date): Promise<UserDTOFields | null>;
}

export type VerificationDeliveryFlow = "registration" | "resend";
export type VerificationDeliveryOutcome = "provider_accepted" | "not_configured" | "failed";

export interface VerificationDeliveryEvent {
  event: "verification_email_delivery";
  flow: VerificationDeliveryFlow;
  outcome: VerificationDeliveryOutcome;
}

export type VerificationDeliveryReporter = (event: VerificationDeliveryEvent) => void;

export interface AuthServiceDependencies {
  repository: AuthRepository;
  email: EmailService;
  clientUrl: string;
  verificationTtlMinutes: number;
  verificationResendCooldownSeconds?: number;
  reportDelivery?: VerificationDeliveryReporter;
  now?: () => Date;
  createToken?: () => string;
  hashPassword?: (password: string) => Promise<string>;
  hashToken?: (token: string) => string;
  accessTokenSecret: string;
  accessTokenTtlSeconds: number;
  accessTokenIssuer?: string;
  accessTokenAudience?: string;
  comparePassword?: (password: string, passwordHash: string) => Promise<boolean>;
  issueAccessToken?: (input: {
    secret: string;
    subject: string;
    ttlSeconds: number;
    issuer: string;
    audience: string;
    now?: Date;
  }) => Promise<string>;
}

const REGISTRATION_MESSAGE = "Request accepted.";
const REGISTRATION_RESPONSE = {
  success: true as const,
  message: REGISTRATION_MESSAGE,
};

function reportDeliverySafely(event: VerificationDeliveryEvent): void {
  const serialized = JSON.stringify(event);
  if (event.outcome === "provider_accepted") {
    console.info(serialized);
  } else {
    console.warn(serialized);
  }
}

function isDuplicateEmailError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}

export class AuthService {
  private readonly now: () => Date;
  private readonly createToken: () => string;
  private readonly hashPassword: (password: string) => Promise<string>;
  private readonly hashToken: (token: string) => string;
  private readonly reportDelivery: VerificationDeliveryReporter;
  private readonly comparePassword: (password: string, passwordHash: string) => Promise<boolean>;
  private readonly issueAccessToken: NonNullable<AuthServiceDependencies["issueAccessToken"]>;

  constructor(private readonly dependencies: AuthServiceDependencies) {
    this.now = dependencies.now ?? (() => new Date());
    this.createToken = dependencies.createToken ?? createVerificationToken;
    this.hashPassword = dependencies.hashPassword ?? hashPassword;
    this.hashToken = dependencies.hashToken ?? hashVerificationToken;
    this.reportDelivery = dependencies.reportDelivery ?? reportDeliverySafely;
    this.comparePassword = dependencies.comparePassword ?? verifyPassword;
    this.issueAccessToken = dependencies.issueAccessToken ?? createAccessToken;
  }

  async login(email: string, password: string): Promise<{ user: SafeUserDTO; accessToken: string }> {
    let user: LoginUserFields | null;
    try {
      user = await this.dependencies.repository.findLoginUser(email.trim().toLowerCase());
      const passwordMatches = await this.comparePassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
      if (!user || !passwordMatches || user.emailVerifiedAt == null || user.isActive !== true) {
        throw new AppError("Invalid email or password", 401);
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("Unable to process login request", 500, false);
    }

    const accessToken = await this.issueAccessToken({
      secret: this.dependencies.accessTokenSecret,
      subject: user._id.toString(),
      ttlSeconds: this.dependencies.accessTokenTtlSeconds,
      issuer: this.dependencies.accessTokenIssuer ?? ACCESS_TOKEN_ISSUER,
      audience: this.dependencies.accessTokenAudience ?? ACCESS_TOKEN_AUDIENCE,
      now: this.now(),
    });
    return { user: toSafeUserDTO(user), accessToken };
  }

  async register(email: string, password: string): Promise<typeof REGISTRATION_RESPONSE> {
    const token = this.createToken();
    const now = this.now();
    const expiresAt = new Date(now.getTime() + this.dependencies.verificationTtlMinutes * 60_000);
    let user: UserDTOFields;

    try {
      user = await this.dependencies.repository.createUser({
        email: email.trim().toLowerCase(),
        passwordHash: await this.hashPassword(password),
        role: "individual_user",
        emailVerificationTokenHash: this.hashToken(token),
        emailVerificationExpiresAt: expiresAt,
      });
    } catch (error) {
      if (isDuplicateEmailError(error)) return REGISTRATION_RESPONSE;
      // Do not let database errors (which can include inserted values) reach logs.
      throw new AppError("Unable to process registration request", 500, false);
    }

    await this.deliverVerification(user.email, token, "registration");
    return REGISTRATION_RESPONSE;
  }

  async verifyEmail(token: string): Promise<SafeUserDTO> {
    let user: UserDTOFields | null;
    try {
      user = await this.dependencies.repository.consumeVerificationToken(this.hashToken(token), this.now());
    } catch {
      throw new AppError("Unable to verify email", 500, false);
    }
    if (!user) throw new AppError("Verification token is invalid or expired", 400);
    return toSafeUserDTO(user);
  }

  async resendVerification(email: string): Promise<void> {
    try {
      const token = this.createToken();
      const now = this.now();
      const tokenExpiresAt = new Date(now.getTime() + this.dependencies.verificationTtlMinutes * 60_000);
      const cooldownSeconds = this.dependencies.verificationResendCooldownSeconds ?? 120;
      const resendAllowedAt = new Date(now.getTime() + cooldownSeconds * 1000);
      const claimant = await this.dependencies.repository.claimResendVerification({
        email: email.trim().toLowerCase(),
        now,
        tokenHash: this.hashToken(token),
        tokenExpiresAt,
        resendAllowedAt,
      });
      // Failed claims neither replace the current token nor initiate delivery.
      if (!claimant) return;

      // The cooldown stays claimed if delivery fails. A later resend after the
      // cooldown creates a fresh token; the raw token is never persisted for retry.
      await this.deliverVerification(claimant.email, token, "resend");
    } catch {
      // The public result remains generic to avoid disclosing account state.
      throw new AppError("Unable to process verification request", 500, false);
    }
  }

  private async deliverVerification(
    email: string,
    token: string,
    flow: VerificationDeliveryFlow,
  ): Promise<EmailDeliveryResult> {
    const verificationUrl = new URL("/verify-email", this.dependencies.clientUrl);
    // Keep the credential in the fragment so browsers do not send it in the
    // HTTP request or Referer header when loading the verification page.
    verificationUrl.hash = new URLSearchParams({ token }).toString();
    // Provider implementations receive the raw value only in memory for delivery.
    // Never log this URL, token, or provider exception details.
    let result: EmailDeliveryResult;
    try {
      result = await this.dependencies.email.sendVerificationEmail({
        to: email,
        verificationUrl: verificationUrl.toString(),
        expiresInMinutes: this.dependencies.verificationTtlMinutes,
      });
    } catch {
      result = { status: "failed" };
    }

    const outcome: VerificationDeliveryOutcome = result.status === "sent"
      ? "provider_accepted"
      : result.status;
    try {
      this.reportDelivery({ event: "verification_email_delivery", flow, outcome });
    } catch {
      // A logging failure must not change the generic public response.
      console.warn(JSON.stringify({ event: "verification_email_delivery_report_failed", flow }));
    }
    return result;
  }
}

// Used for a bcrypt comparison when the email is absent to reduce timing differences.
const DUMMY_PASSWORD_HASH = "$2a$12$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

