import { User } from "../models/User.js";
import type { AuthRepository, NewUserData } from "./auth.service.js";
import type { LoginUserFields, UserDTOFields } from "./user.dto.js";

export class MongoAuthRepository implements AuthRepository {
  constructor(private readonly users: typeof User = User) {}

  async findLoginUser(email: string): Promise<LoginUserFields | null> {
    const user = await this.users.findOne({ email }).select("+passwordHash");
    return user as unknown as LoginUserFields | null;
  }

  async createUser(data: NewUserData): Promise<UserDTOFields> {
    return (await this.users.create(data)) as unknown as UserDTOFields;
  }

  async claimResendVerification(input: {
    email: string;
    now: Date;
    tokenHash: string;
    tokenExpiresAt: Date;
    resendAllowedAt: Date;
  }): Promise<{ id: string; email: string } | null> {
    const updated = await this.users.findOneAndUpdate(
      {
        email: input.email,
        emailVerifiedAt: null,
        $or: [
          { verificationResendAllowedAt: null },
          { verificationResendAllowedAt: { $lte: input.now } },
        ],
      },
      {
        $set: {
          emailVerificationTokenHash: input.tokenHash,
          emailVerificationExpiresAt: input.tokenExpiresAt,
          verificationResendAllowedAt: input.resendAllowedAt,
        },
      },
      { new: true, projection: { _id: 1, email: 1 } },
    ).lean();
    return updated ? { id: String(updated._id), email: updated.email } : null;
  }

  async consumeVerificationToken(tokenHash: string, now: Date): Promise<UserDTOFields | null> {
    const user = await this.users.findOneAndUpdate(
      {
        emailVerificationTokenHash: tokenHash,
        emailVerificationExpiresAt: { $gt: now },
        emailVerifiedAt: null,
      },
      {
        $set: { emailVerifiedAt: now },
        $unset: { emailVerificationTokenHash: 1, emailVerificationExpiresAt: 1 },
      },
      { new: true },
    ).select("_id email role emailVerifiedAt createdAt updatedAt");
    return user as unknown as UserDTOFields | null;
  }
}
