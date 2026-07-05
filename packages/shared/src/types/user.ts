/** UUID type alias used across all entities */
export type UUID = string;

/** Represents a registered user of the CodingKitty platform */
export interface User {
  id: UUID;
  email: string;
  displayName: string;
  passwordHash: string;
  xp: number;
  createdAt: Date;
}

/** Public-facing user data (omits sensitive fields) */
export type PublicUser = Omit<User, 'passwordHash'>;
