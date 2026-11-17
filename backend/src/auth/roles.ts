export const USER_ROLES = [
  "individual_user",
  "business_owner",
  "business_staff",
  "super_admin",
] as const;

export type UserRole = (typeof USER_ROLES)[number];
