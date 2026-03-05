
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged, 
  sendEmailVerification,
  User
} from 'firebase/auth';
import { getFirebase } from '../firebase';
import { IAuthService, AuthUser } from './auth-service';

export class FirebaseAuthService implements IAuthService {
  private mapUser(user: User | null): AuthUser | null {
    if (!user) return null;
    return {
      uid: user.uid,
      email: user.email,
      emailVerified: user.emailVerified
    };
  }

  async login(email: string, password: string): Promise<AuthUser> {
    const { auth } = getFirebase();
    if (!auth) throw new Error("Auth not initialized");
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return this.mapUser(cred.user)!;
  }

  async register(email: string, password: string): Promise<AuthUser> {
    const { auth } = getFirebase();
    if (!auth) throw new Error("Auth not initialized");
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await sendEmailVerification(cred.user);
    return this.mapUser(cred.user)!;
  }

  async logout(): Promise<void> {
    const { auth } = getFirebase();
    if (auth) await signOut(auth);
  }

  onAuthStateChanged(callback: (user: AuthUser | null) => void): () => void {
    const { auth } = getFirebase();
    if (!auth) {
        callback(null);
        return () => {};
    }
    return onAuthStateChanged(auth, (user) => {
      callback(this.mapUser(user));
    });
  }

  async sendVerificationEmail(): Promise<void> {
    const { auth } = getFirebase();
    if (auth?.currentUser) {
      await sendEmailVerification(auth.currentUser);
    }
  }

  async reloadUser(): Promise<AuthUser | null> {
    const { auth } = getFirebase();
    if (auth?.currentUser) {
      await auth.currentUser.reload();
      return this.mapUser(auth.currentUser);
    }
    return null;
  }
}
