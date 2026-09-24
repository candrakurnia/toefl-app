export function formatDuration(seconds: number) {
  if (seconds <= 0) return '0 minutes';
  if (seconds % 3600 === 0) {
    const hours = seconds / 3600;
    return hours === 1 ? '1 hour' : `${hours} hours`;
  }
  if (seconds % 60 === 0) {
    const minutes = seconds / 60;
    return minutes === 1 ? '1 minute' : `${minutes} minutes`;
  }
  return `${seconds} seconds`;
}

export function formatQuestionType(type: string) {
  switch (type) {
    case 'multiple_choice':
      return 'Multiple choice';
    case 'essay':
      return 'Essay';
    case 'listening':
      return 'Listening';
    case 'speaking':
      return 'Speaking';
    default:
      return type;
  }
}

export function formatStatus(status: string) {
  switch (status) {
    case 'not_started':
      return 'Not started';
    case 'in_progress':
      return 'In progress';
    case 'completed':
      return 'Completed';
    default:
      return status;
  }
}

/** Display clock for a server deadline. Never treats hidden time as paused. */
export function formatCountdown(ms: number) {
  if (!Number.isFinite(ms)) return '—';
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  if (hours > 0) return `${hours}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

export function formatOverall(overallScore: number | null, overallMaxScore: number) {
  if (overallScore === null) return `Overall pending / ${overallMaxScore}`;
  return `Overall ${overallScore} / ${overallMaxScore}`;
}

export function formatViolations(violations: {
  total: number;
  fullscreenExit: number;
  tabBlur: number;
}) {
  if (violations.total === 0) return 'Violations recorded: 0';
  const parts: string[] = [];
  if (violations.fullscreenExit > 0) {
    const label = violations.fullscreenExit === 1 ? 'exit' : 'exits';
    parts.push(`${violations.fullscreenExit} fullscreen ${label}`);
  }
  if (violations.tabBlur > 0) {
    const label = violations.tabBlur === 1 ? 'blur' : 'blurs';
    parts.push(`${violations.tabBlur} tab ${label}`);
  }
  const detail = parts.length > 0 ? ` (${parts.join(', ')})` : '';
  return `Violations recorded: ${violations.total}${detail}`;
}

export function formatDateTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

export function formatScoringStatus(status: string) {
  switch (status) {
    case 'pending':
      return 'Pending AI scoring';
    case 'scored':
      return 'Scored';
    default:
      return status;
  }
}
