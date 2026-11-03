import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setAuthToken, setUnauthorizedHandler, type User } from './api';
import { AuthDialog } from './components/AuthDialog';
import { useToast } from './toast';

interface Session {
  token: string;
  user: User;
}

interface AuthContextValue {
  user: User | null;
  login(email: string, password: string): Promise<void>;
  register(input: { email: string; password: string; name: string }): Promise<void>;
  logout(): void;
  openAuth(): void;
}

const STORAGE_KEY = 'sponge-trip-session';
const AuthContext = createContext<AuthContextValue | null>(null);

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function saveSession(session: Session | null): void {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 저장소를 쓸 수 없는 환경이면 이 탭에서만 로그인 상태를 유지한다
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => {
    const saved = loadSession();
    setAuthToken(saved?.token ?? null);
    return saved;
  });
  const [authOpen, setAuthOpen] = useState(false);
  const toast = useToast();

  const apply = useCallback((next: Session | null) => {
    setAuthToken(next?.token ?? null);
    saveSession(next);
    setSession(next);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      apply(null);
      toast('로그인이 만료되었습니다. 다시 로그인해주세요.', 'error');
      setAuthOpen(true);
    });
  }, [apply, toast]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      async login(email, password) {
        apply(await api<Session>('/auth/login', { method: 'POST', body: { email, password } }));
      },
      async register(input) {
        apply(await api<Session>('/auth/register', { method: 'POST', body: input }));
      },
      logout() {
        apply(null);
        toast('로그아웃했습니다.');
      },
      openAuth: () => setAuthOpen(true),
    }),
    [session, apply, toast],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} />
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('AuthProvider 안에서만 쓸 수 있습니다.');
  return ctx;
}
