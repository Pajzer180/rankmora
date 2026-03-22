'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { getClientAuth, getClientDb } from '@/lib/firebase';
import type { UserProfile } from '@/types/profile';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AuthContextType {
  user: User | null;
  loading: boolean;
  profile: UserProfile | null;
  profileLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  saveProfile: (data: Partial<Omit<UserProfile, 'uid'>>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapFirebaseError(code: string): string {
  const errors: Record<string, string> = {
    'auth/invalid-credential':   'Nieprawidłowy e-mail lub hasło.',
    'auth/user-not-found':       'Nie znaleziono konta z tym adresem e-mail.',
    'auth/wrong-password':       'Nieprawidłowe hasło.',
    'auth/email-already-in-use': 'Ten adres e-mail jest już zajęty.',
    'auth/weak-password':        'Hasło musi mieć co najmniej 6 znaków.',
    'auth/too-many-requests':    'Zbyt wiele prób. Spróbuj ponownie później.',
    'auth/invalid-email':        'Podaj prawidłowy adres e-mail.',
  };
  return errors[code] ?? 'Wystąpił błąd. Spróbuj ponownie.';
}

function setAuthCookie(value: string) {
  document.cookie = `bress-auth=${value}; path=/; max-age=31536000`;
}
function clearAuthCookie() {
  document.cookie = 'bress-auth=; path=/; max-age=0';
}
function setOnboardingCookie() {
  document.cookie = 'bress-onboarding=1; path=/; max-age=31536000';
}
function clearOnboardingCookie() {
  document.cookie = 'bress-onboarding=; path=/; max-age=0';
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,           setUser]           = useState<User | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [profile,        setProfile]        = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    const auth = getClientAuth();

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser) {
        setAuthCookie('1');
        setProfileLoading(true);

        try {
          const db   = getClientDb();
          const snap = await getDoc(doc(db, 'profiles', firebaseUser.uid));
          if (snap.exists()) {
            const data = snap.data() as UserProfile;
            setProfile(data);
            if (data.onboardingCompleted) setOnboardingCookie();
          }
        } catch {
          // Firestore not yet configured — ignore silently
        } finally {
          setProfileLoading(false);
        }
      } else {
        clearAuthCookie();
        clearOnboardingCookie();
        setProfile(null);
      }

      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // ── saveProfile ──────────────────────────────────────────────────────────

  const saveProfile = async (data: Partial<Omit<UserProfile, 'uid'>>) => {
    if (!user) return;

    try {
      const db  = getClientDb();
      const ref = doc(db, 'profiles', user.uid);
      const snap = await getDoc(ref);

      if (snap.exists()) {
        await updateDoc(ref, data);
      } else {
        await setDoc(ref, {
          uid: user.uid,
          createdAt: Date.now(),
          onboardingCompleted: false,
          firstName: '',
          seoLevel: 'beginner',
          accountType: 'freelancer',
          domain: '',
          businessGoal: 'traffic',
          agentTone: 'professional',
          gscConnected: false,
          ...data,
        });
      }
    } catch {
      // Firestore write failed — still update local state & cookies below
    }

    setProfile((prev) => ({ ...prev!, uid: user.uid, ...data }));
    if (data.onboardingCompleted) setOnboardingCookie();
  };

  // ── Auth methods ─────────────────────────────────────────────────────────

  const signIn = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(getClientAuth(), email, password);
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? '';
      throw new Error(mapFirebaseError(code));
    }
  };

  const signUp = async (email: string, password: string) => {
    try {
      await createUserWithEmailAndPassword(getClientAuth(), email, password);
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? '';
      throw new Error(mapFirebaseError(code));
    }
  };

  const signOut = async () => {
    await firebaseSignOut(getClientAuth());
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, profile, profileLoading, signIn, signUp, signOut, saveProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth musi być użyty wewnątrz AuthProvider');
  return ctx;
}
