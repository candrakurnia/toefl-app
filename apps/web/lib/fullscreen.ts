/** Ask the browser to take the page fullscreen. Returns false when the request is denied. */
export async function requestExamFullscreen() {
  if (typeof document === 'undefined') return false;
  if (document.fullscreenElement) return true;
  const root = document.documentElement;
  if (typeof root.requestFullscreen !== 'function') return false;
  try {
    await root.requestFullscreen();
    return Boolean(document.fullscreenElement);
  } catch {
    return false;
  }
}
