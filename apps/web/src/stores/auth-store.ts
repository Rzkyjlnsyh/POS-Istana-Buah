import type { AuthUser, UserRole } from '@istana-buah/shared';
import { create } from 'zustand';
import { defaultRefreshTokenStorage, type RefreshTokenStorage } from './auth-storage';

export interface SessionPayload {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface TokenRotationPayload {
  accessToken: string;
  refreshToken: string;
  user?: AuthUser;
}

export interface SessionNotice {
  title: string;
  description: string;
}

export interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isHydrated: boolean;
  sessionNotice: SessionNotice | null;
  setSession: (payload: SessionPayload) => void;
  updateTokens: (payload: TokenRotationPayload) => void;
  setUser: (user: AuthUser) => void;
  clearSession: (notice?: SessionNotice | null) => void;
  clearSessionNotice: () => void;
  setHydrated: (hydrated: boolean) => void;
  getRefreshToken: () => string | null;
}

export function getDefaultRouteForRole(role: UserRole): string {
  return role === 'CASHIER' ? '/pos' : '/dashboard';
}

export function createAuthStore(storage: RefreshTokenStorage = defaultRefreshTokenStorage) {
  return create<AuthState>((set) => ({
    user: null,
    accessToken: null,
    isAuthenticated: false,
    isHydrated: false,
    sessionNotice: null,

    setSession: ({ accessToken, refreshToken, user }) => {
      storage.setRefreshToken(refreshToken);
      set({
        user,
        accessToken,
        isAuthenticated: true,
        isHydrated: true,
        sessionNotice: null,
      });
    },

    updateTokens: ({ accessToken, refreshToken, user }) => {
      storage.setRefreshToken(refreshToken);
      set((state) => ({
        accessToken,
        user: user ?? state.user,
        isAuthenticated: Boolean(user ?? state.user),
      }));
    },

    setUser: (user) => {
      set((state) => ({
        user,
        isAuthenticated: Boolean(state.accessToken),
      }));
    },

    clearSession: (notice = null) => {
      storage.clearRefreshToken();
      set({
        user: null,
        accessToken: null,
        isAuthenticated: false,
        isHydrated: true,
        sessionNotice: notice,
      });
    },

    clearSessionNotice: () => {
      set({ sessionNotice: null });
    },

    setHydrated: (hydrated) => {
      set({ isHydrated: hydrated });
    },

    getRefreshToken: () => storage.getRefreshToken(),
  }));
}

export const useAuthStore = createAuthStore();
