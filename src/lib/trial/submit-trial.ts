// The one seam between the trial form and a backend.
// Owner decision 2026-10-13: the trial is advertised but NOT wired yet, and the site must not
// talk to any database. Until a backend exists this adapter saves nothing and sends nothing,
// and the form tells the visitor so. Wiring the trial later = replacing this function only.

export type TrialPayload = {
  email: string;
  company_name: string;
  full_name: string;
  phone?: string;
  crew_size?: string;
  current_tool?: string;
  source: string;
};

export type TrialResult =
  | { state: 'not-open' }
  | { state: 'ok'; id: string }
  | { state: 'error'; message: string };

export async function submitTrial(_payload: TrialPayload): Promise<TrialResult> {
  return { state: 'not-open' };
}
