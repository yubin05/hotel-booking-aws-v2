import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth';
import { useToast } from '../toast';
import { Dialog } from './Dialog';
import { Field } from './ui';

export function AuthDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { login, register } = useAuth();
  const toast = useToast();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isLogin = mode === 'login';

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get('email'));
    const password = String(form.get('password'));
    setBusy(true);
    setError('');
    try {
      if (isLogin) await login(email, password);
      else await register({ email, password, name: String(form.get('name')) });
      toast(isLogin ? '로그인했습니다.' : '가입을 환영합니다! 쿠폰함에서 첫 예약 쿠폰을 받아 보세요.', 'success');
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={isLogin ? '로그인' : '회원가입'}>
      <form key={mode} onSubmit={submit} className="space-y-3">
        {!isLogin && <Field label="이름" name="name" autoComplete="name" required maxLength={100} />}
        <Field label="이메일" name="email" type="email" autoComplete="email" required />
        <Field
          label="비밀번호"
          name="password"
          type="password"
          autoComplete={isLogin ? 'current-password' : 'new-password'}
          required
          minLength={8}
          hint={isLogin ? undefined : '8자 이상'}
        />
        {error && (
          <p role="alert" className="text-sm text-rose-600">
            {error}
          </p>
        )}
        <button disabled={busy} className="btn-primary w-full">
          {busy ? '처리 중…' : isLogin ? '로그인' : '가입하고 시작하기'}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-500">
        {isLogin ? '처음이신가요?' : '이미 계정이 있나요?'}{' '}
        <button
          type="button"
          className="font-semibold text-teal-700 hover:underline"
          onClick={() => {
            setMode(isLogin ? 'register' : 'login');
            setError('');
          }}
        >
          {isLogin ? '회원가입' : '로그인'}
        </button>
      </p>
    </Dialog>
  );
}
