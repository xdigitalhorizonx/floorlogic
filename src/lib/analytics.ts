// Vercel Web Analytics custom events. No-op unless the analytics script is present.
// Never pass personal data (emails, names, phones) in event data.
type VA = (cmd: 'event', payload: { name: string; data?: Record<string, string | number | boolean> }) => void;

export function track(name: string, data?: Record<string, string | number | boolean>) {
  const va = (window as unknown as { va?: VA }).va;
  if (typeof va === 'function') va('event', { name, data });
}
