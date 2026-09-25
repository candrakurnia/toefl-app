const KEY = 'toefl.sampleMode';

type Listener = (enabled: boolean) => void;

const listeners = new Set<Listener>();
let enabled = false;
let hydrated = false;

function hydrate() {
  if (hydrated || typeof window === 'undefined') return;
  hydrated = true;
  enabled = window.sessionStorage.getItem(KEY) === '1';
}

export function isSampleMode() {
  hydrate();
  return enabled;
}

export function enableSampleMode() {
  hydrate();
  if (enabled) return;
  enabled = true;
  if (typeof window !== 'undefined') window.sessionStorage.setItem(KEY, '1');
  listeners.forEach((listener) => listener(true));
}

export function subscribeSampleMode(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
