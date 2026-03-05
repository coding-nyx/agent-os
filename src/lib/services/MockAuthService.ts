
import { IAuthService, AuthUser } from './auth-service';

export class MockAuthService implements IAuthService {
  private user: AuthUser | null = null;
  private listeners: ((user: AuthUser | null) => void)[] = [];

  constructor() {
      // Check for local session mock
      const saved = localStorage.getItem('agnes_mock_user');
      if (saved) {
          this.user = JSON.parse(saved);
      }
  }

  async login(email: string, password: string): Promise<AuthUser> {
    this.user = { uid: 'mock_user_' + email, email, emailVerified: true };
    localStorage.setItem('agnes_mock_user', JSON.stringify(this.user));
    this.notify();
    return this.user;
  }

  async register(email: string, password: string): Promise<AuthUser> {
    this.user = { uid: 'mock_user_' + email, email, emailVerified: true };
    localStorage.setItem('agnes_mock_user', JSON.stringify(this.user));
    this.notify();
    return this.user;
  }

  async logout(): Promise<void> {
    this.user = null;
    localStorage.removeItem('agnes_mock_user');
    this.notify();
  }

  onAuthStateChanged(callback: (user: AuthUser | null) => void): () => void {
    this.listeners.push(callback);
    callback(this.user);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  private notify() {
    this.listeners.forEach(l => l(this.user));
  }

  async sendVerificationEmail(): Promise<void> {
    console.log("Mock verification sent.");
  }

  async reloadUser(): Promise<AuthUser | null> {
    return this.user;
  }

  getCurrentUser(): AuthUser | null {
    return this.user;
  }
}
