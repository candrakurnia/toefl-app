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
