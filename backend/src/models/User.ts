import { Schema, model } from "mongoose";
import { USER_ROLES, type UserRole } from "../auth/roles.js";

export interface UserRecord {
  email: string;
  passwordHash: string;
  role: UserRole;
  emailVerifiedAt: Date | null;
  emailVerificationTokenHash: string | null;
  emailVerificationExpiresAt: Date | null;
  verificationResendAllowedAt: Date | null;
  passwordResetTokenHash: string | null;
  passwordResetExpiresAt: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserRecord>(
  {
    email: { type: String, required: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: USER_ROLES,
      default: "individual_user",
      required: true,
    },
    emailVerifiedAt: { type: Date, default: null },
    emailVerificationTokenHash: { type: String, default: null, select: false },
    emailVerificationExpiresAt: { type: Date, default: null },
    verificationResendAllowedAt: { type: Date, default: null },
    passwordResetTokenHash: { type: String, default: null, select: false },
    passwordResetExpiresAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true, required: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_document, result) => {
        const safeResult = result as Record<string, unknown>;
        Reflect.deleteProperty(safeResult, "passwordHash");
        Reflect.deleteProperty(safeResult, "emailVerificationTokenHash");
        Reflect.deleteProperty(safeResult, "passwordResetTokenHash");
        Reflect.deleteProperty(safeResult, "__v");
        return result;
      },
    },
    toObject: {
      transform: (_document, result) => {
        const safeResult = result as Record<string, unknown>;
        Reflect.deleteProperty(safeResult, "passwordHash");
        Reflect.deleteProperty(safeResult, "emailVerificationTokenHash");
        Reflect.deleteProperty(safeResult, "passwordResetTokenHash");
        Reflect.deleteProperty(safeResult, "__v");
        return result;
      },
    },
  },
);

// Normalize before persistence and enforce uniqueness in MongoDB as well.
userSchema.pre("validate", function normalizeEmail() {
  if (this.email) this.email = this.email.trim().toLowerCase();
});

userSchema.index({ email: 1 }, { unique: true, name: "user_email_unique" });
userSchema.index(
  { emailVerificationTokenHash: 1 },
  {
    unique: true,
    partialFilterExpression: { emailVerificationTokenHash: { $type: "string" } },
    name: "user_email_verification_token_unique",
  },
);
userSchema.index(
  { passwordResetTokenHash: 1 },
  {
    unique: true,
    partialFilterExpression: { passwordResetTokenHash: { $type: "string" } },
    name: "user_password_reset_token_unique",
  },
);

export const User = model<UserRecord>("User", userSchema);
