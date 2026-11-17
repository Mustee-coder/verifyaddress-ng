import { Schema, model, Types } from "mongoose";

export interface SessionRecord {
  userId: Types.ObjectId;
  refreshTokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const sessionSchema = new Schema<SessionRecord>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    refreshTokenHash: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    lastUsedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_document, result) => {
        const safeResult = result as Record<string, unknown>;
        Reflect.deleteProperty(safeResult, "refreshTokenHash");
        Reflect.deleteProperty(safeResult, "__v");
        return result;
      },
    },
    toObject: {
      transform: (_document, result) => {
        const safeResult = result as Record<string, unknown>;
        Reflect.deleteProperty(safeResult, "refreshTokenHash");
        Reflect.deleteProperty(safeResult, "__v");
        return result;
      },
    },
  },
);

sessionSchema.index(
  { refreshTokenHash: 1 },
  { unique: true, name: "session_refresh_token_hash_unique" },
);
sessionSchema.index({ userId: 1, revokedAt: 1 }, { name: "session_user_active" });
// TTL cleanup is eventual; authentication must always check expiresAt itself.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "session_expiry_ttl" });

export const Session = model<SessionRecord>("Session", sessionSchema);
