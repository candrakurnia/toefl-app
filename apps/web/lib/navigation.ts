export function safeNextPath(input: string | null | undefined) {
  if (!input) return '/exams';
  if (!input.startsWith('/') || input.startsWith('//') || input.startsWith('/\\')) return '/exams';
  if (input.startsWith('/login') || input.startsWith('/register')) return '/exams';
  return input;
}
