'use client';

export function AuthScreen({
  title,
  subtitle,
  footer,
  children,
}: {
  title: string;
  subtitle: string;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-5 py-12 text-ink">
      <div className="w-full max-w-md rounded-card border border-ink/10 bg-card p-8 shadow-sm">
        <p className="text-xs tracking-[0.16em] text-ink/50 uppercase">TOEFL Practice</p>
        <h1 className="mt-2 font-serif text-3xl">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-ink/70">{subtitle}</p>
        <div className="mt-8">{children}</div>
        <p className="mt-6 text-sm text-ink/70">{footer}</p>
      </div>
    </div>
  );
}

export function Field({
  label,
  type,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block font-medium">{label}</span>
      <input
        required
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-control border border-ink/15 bg-canvas px-3 py-2.5 outline-none"
      />
    </label>
  );
}
