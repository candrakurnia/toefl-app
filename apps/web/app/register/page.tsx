'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { AuthScreen, Field } from '../../components/auth-screen';
import { useAuth } from '../../components/providers';
import { ApiError } from '../../lib/api';
import { loginAccount, registerAccount } from '../../lib/client';
import { hasCredentialErrors, validateCredentials } from '../../lib/validation';

export default function RegisterPage() {
  const router = useRouter();
  const { token, ready } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (ready && token) router.replace('/exams');
  }, [ready, token, router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const nextErrors = validateCredentials(email, password);
    setErrors(nextErrors);
    setFormError(null);
    if (hasCredentialErrors(nextErrors)) return;

    const credentials = { email: email.trim().toLowerCase(), password };
    setPending(true);
    try {
      await registerAccount(credentials);
      await loginAccount(credentials);
      router.push('/exams');
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not create the account');
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthScreen
      title="Create an account"
      subtitle="Use the email you want on your practice history, and a password of at least 8 characters."
      footer={
        <>
          Already registered?{' '}
          <Link href="/login" className="font-medium text-primary">
            Sign in
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
          autoComplete="new-password"
          error={errors.password}
          hint="At least 8 characters."
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
          {pending ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </AuthScreen>
  );
}
