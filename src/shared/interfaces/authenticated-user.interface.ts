/**
 * Shape of `req.user` after AuthGuard verification.
 * The guard normalizes the JWT `sub` claim into `id`
 * (see src/core/guards/auth.guard.ts).
 */
export interface AuthenticatedUser {
  id: string;
  sub: string;
  email: string;
  role: string; // 'customer' | 'moderator' | 'admin'
  jti?: string;
}
