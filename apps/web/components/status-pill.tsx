import { formatStatus } from '../lib/format';

const styles: Record<string, string> = {
  not_started: 'bg-ink/5 text-ink/70',
  in_progress: 'bg-primary/10 text-primary',
  completed: 'bg-emerald-50 text-emerald-800',
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${styles[status] ?? styles.not_started}`}
    >
      {formatStatus(status)}
    </span>
  );
}
