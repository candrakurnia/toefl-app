'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { AuthScreen, Field } from '../../components/auth-screen';
import { useAuth } from '../../components/providers';
import { ApiError } from '../../lib/api';
import { loginAccount } from '../../lib/client';
import { safeNextPath } from '../../lib/navigation';
import { hasCredentialErrors, validateCredentials } from '../../lib/validation';

export default function LoginPage() {
  const router = useRouter();
  const { token, ready } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [nextPath, setNextPath] = useState('/exams');

  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get('next');
    setNextPath(safeNextPath(param));
  }, []);

  useEffect(() => {
    if (ready && token) router.replace(nextPath);
  }, [ready, token, nextPath, router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const nextErrors = validateCredentials(email, password);
    setErrors(nextErrors);
    setFormError(null);
    if (hasCredentialErrors(nextErrors)) return;

    setPending(true);
    try {
      await loginAccount({ email: email.trim().toLowerCase(), password });
      router.push(nextPath);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not sign in');
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthScreen
      title="Sign in"
      subtitle="Continue a practice test, or open one you have not started."
      footer={
        <>
          New here?{' '}
          <Link href="/register" className="font-medium text-primary">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field
          label="Email"
          name="email"
          type="email"
          value={email}
          autoComplete="email"
          error={errors.email}
          onChange={(value) => {
            setEmail(value);
            setErrors((current) => ({ ...current, email: undefined }));
          }}
        />
        <Field
          label="Password"
          name="password"
          type="password"
          value={password}
          autoComplete="current-password"
          error={errors.password}
          onChange={(value) => {
            setPassword(value);
            setErrors((current) => ({ ...current, password: undefined }));
          }}
        />
        {formError ? (
          <p role="alert" className="rounded-control bg-red-50 px-3 py-2 text-sm text-red-700">
            {formError}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-control bg-primary px-4 py-3 text-sm font-medium text-white shadow-card hover:bg-primary-hover disabled:opacity-60"
        >
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthScreen>
  );
}
