
export interface AuthUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
}

export interface IAuthService {
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  onAuthStateChanged: (callback: (user: AuthUser | null) => void) => () => void;
  sendVerificationEmail: () => Promise<void>;
  reloadUser: () => Promise<AuthUser | null>;
}
