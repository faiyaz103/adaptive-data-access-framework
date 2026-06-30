export interface AuthenticatedUser {
  id: string;
  email: string;
  roles: string[];
  metadata: Record<string, unknown>;
}
