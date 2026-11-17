import type { UserRole } from "./roles.js";

/** Explicit allowlist of fields that may cross the API boundary. */
export interface SafeUserDTO {
  id: string;
  email: string;
  role: UserRole;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserDTOFields {
  _id: { toString(): string } | string;
  email: string;
  role: UserRole;
  emailVerifiedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Private login projection; never serialize this object directly. */
export interface LoginUserFields extends UserDTOFields {
  passwordHash: string;
  isActive: boolean;
}

/** Builds a response from a whitelist, never by spreading a database record. */
export function toSafeUserDTO(user: UserDTOFields): SafeUserDTO {
  return {
    id: user._id.toString(),
    email: user.email,
    role: user.role,
    emailVerified: user.emailVerifiedAt != null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
