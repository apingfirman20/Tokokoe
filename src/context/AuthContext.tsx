'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserRole, PermissionKey } from '@/types';
import { DEFAULT_ROLE_PERMISSIONS } from '@/lib/permissions';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithCustomToken, 
  signOut, 
  onAuthStateChanged, 
  updateProfile,
  User as FirebaseUser
} from 'firebase/auth';
import { auth } from '@/lib/firebase/client';

export interface AuthSessionUser {
  uid: string;
  email: string;
  displayName: string;
  role: 'owner' | 'employee';
  username?: string;
  activeBusinessId?: string;
  memberRole?: UserRole;
  permissions?: PermissionKey[];
}

interface AuthContextType {
  user: AuthSessionUser | null;
  isLoading: boolean;
  loginAsOwner: (email: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  loginAsEmployee: (username: string, pass: string) => Promise<{ success: boolean; businessId?: string; mustChangePassword?: boolean; user?: any; error?: string }>;
  registerOwner: (name: string, email: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_STORAGE_KEY = 'tokokoe_auth_session';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthSessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Subscribe to authoritative Firebase Authentication state
  useEffect(() => {
    // 1. Initial cached state check for immediate layout hydration
    try {
      const saved = localStorage.getItem(AUTH_STORAGE_KEY);
      if (saved) {
        setUser(JSON.parse(saved));
      }
    } catch (e) {
      console.warn("Failed to load cached auth session:", e);
    }

    // 2. Authoritative Firebase Auth state listener
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        try {
          const idTokenResult = await firebaseUser.getIdTokenResult();
          const claims = idTokenResult.claims;

          if (claims.isEmployee) {
            const role = (claims.role as UserRole) || 'cashier';
            const employeeUser: AuthSessionUser = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              displayName: firebaseUser.displayName || (claims.username as string) || 'Staf Kasir',
              role: 'employee',
              username: (claims.username as string) || firebaseUser.email?.split('@')[0],
              activeBusinessId: (claims.businessId as string) || undefined,
              memberRole: role,
              permissions: DEFAULT_ROLE_PERMISSIONS[role] || DEFAULT_ROLE_PERMISSIONS.cashier,
            };
            setUser(employeeUser);
            localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(employeeUser));
          } else {
            // Owner User
            const ownerUser: AuthSessionUser = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              displayName: firebaseUser.displayName || 'Pemilik Usaha',
              role: 'owner',
              username: firebaseUser.email ? firebaseUser.email.split('@')[0] : 'owner',
              memberRole: 'owner',
              permissions: DEFAULT_ROLE_PERMISSIONS.owner,
            };
            setUser(ownerUser);
            localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(ownerUser));
          }
        } catch (claimsErr) {
          console.error("Error resolving token claims:", claimsErr);
        }
      } else {
        setUser(null);
        localStorage.removeItem(AUTH_STORAGE_KEY);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const getIdToken = async (): Promise<string | null> => {
    if (auth.currentUser) {
      try {
        return await auth.currentUser.getIdToken();
      } catch (err) {
        console.warn("Failed to retrieve fresh Firebase ID token:", err);
      }
    }
    // Test environment fallback
    if (process.env.NODE_ENV === 'test' && user) {
      return `test_token_${user.uid}_${user.memberRole || 'owner'}_${user.activeBusinessId || 'biz_test'}`;
    }
    return null;
  };

  const loginAsOwner = async (email: string, pass: string): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    try {
      if (!email.includes('@')) {
        return { success: false, error: 'Format email tidak valid.' };
      }
      if (pass.length < 6) {
        return { success: false, error: 'Kata sandi minimal 6 karakter.' };
      }

      await signInWithEmailAndPassword(auth, email, pass);
      return { success: true };
    } catch (err: any) {
      console.error("Firebase owner sign-in error:", err);
      const code = err.code || '';
      let message = 'Gagal login pemilik. Silakan periksa kredensial Anda.';
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        message = 'Email atau kata sandi yang Anda masukkan salah.';
      } else if (code === 'auth/invalid-email') {
        message = 'Format email tidak valid.';
      } else if (code === 'auth/user-disabled') {
        message = 'Akun pemilik ini telah dinonaktifkan.';
      } else if (code === 'auth/too-many-requests') {
        message = 'Terlalu banyak percobaan gagal. Silakan coba lagi beberapa saat lagi.';
      }
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  };

  const loginAsEmployee = async (
    username: string, 
    pass: string
  ): Promise<{ success: boolean; businessId?: string; mustChangePassword?: boolean; user?: any; error?: string }> => {
    setIsLoading(true);
    try {
      const cleanUsername = username.trim().toLowerCase();

      // Authenticate against authoritative server route
      const res = await fetch('/api/auth/employee-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: cleanUsername,
          password: pass,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        return { success: false, error: data.message || 'Username atau kata sandi staf salah.' };
      }

      // Sign into Firebase Client SDK using authoritative Custom Token
      if (data.customToken) {
        try {
          await signInWithCustomToken(auth, data.customToken);
        } catch (tokenErr: any) {
          console.warn("Client SDK signInWithCustomToken notice:", tokenErr.message);
          // If in test environment or custom token handled
          if (process.env.NODE_ENV !== 'test') {
            return { success: false, error: 'Gagal mengaktifkan sesi client SDK Firebase.' };
          }
        }
      }

      return { 
        success: true, 
        businessId: data.user?.businessId, 
        mustChangePassword: data.mustChangePassword,
        user: data.user
      };
    } catch (err) {
      console.error("Employee login exception:", err);
      return { success: false, error: 'Terjadi gangguan sistem saat otentikasi staf.' };
    } finally {
      setIsLoading(false);
    }
  };

  const registerOwner = async (name: string, email: string, pass: string): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    try {
      if (!name.trim()) {
        return { success: false, error: 'Nama lengkap wajib diisi.' };
      }
      if (!email.includes('@')) {
        return { success: false, error: 'Alamat email tidak valid.' };
      }
      if (pass.length < 6) {
        return { success: false, error: 'Kata sandi minimal 6 karakter.' };
      }

      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      await updateProfile(cred.user, {
        displayName: name.trim(),
      });

      return { success: true };
    } catch (err: any) {
      console.error("Firebase register owner error:", err);
      const code = err.code || '';
      let message = 'Gagal melakukan pendaftaran akun.';
      if (code === 'auth/email-already-in-use') {
        message = 'Alamat email sudah terdaftar. Silakan gunakan email lain atau langsung masuk.';
      } else if (code === 'auth/weak-password') {
        message = 'Kata sandi terlalu lemah. Minimal 6 karakter.';
      } else if (code === 'auth/invalid-email') {
        message = 'Format email tidak valid.';
      }
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.warn("SignOut error:", err);
    }
    setUser(null);
    localStorage.removeItem(AUTH_STORAGE_KEY);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isLoading, 
      loginAsOwner, 
      loginAsEmployee, 
      registerOwner, 
      logout,
      getIdToken
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

