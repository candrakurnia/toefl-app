export interface CredentialErrors {
  email?: string;
  password?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateCredentials(email: string, password: string): CredentialErrors {
  const errors: CredentialErrors = {};
  const trimmed = email.trim();

  if (!trimmed) {
    errors.email = 'Enter your email.';
  } else if (trimmed.length > 254 || !EMAIL_PATTERN.test(trimmed)) {
    errors.email = 'Enter a valid email address.';
  }

  if (!password) {
    errors.password = 'Enter a password.';
  } else if (password.length < 8) {
    errors.password = 'Use at least 8 characters.';
  } else if (password.length > 72) {
    errors.password = 'Use at most 72 characters.';
  }

  return errors;
}

export function hasCredentialErrors(errors: CredentialErrors) {
  return Boolean(errors.email || errors.password);
}
