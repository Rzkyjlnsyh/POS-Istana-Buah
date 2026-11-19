import type { UserRole } from '@istana-buah/shared';

export interface AuthenticatedRequestUser {
  id: string;
  role: UserRole;
  tokenJti: string;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthenticatedRequestUser;
      validatedQuery?: unknown;
    }
  }
}
