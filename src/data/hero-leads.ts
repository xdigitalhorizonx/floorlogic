/**
 * The hero's Leads screen, derived from the one sample dataset (sample-data.ts,
 * never edited here). Everything is fictional; nothing is invented beyond what
 * the app itself would show for these records.
 *
 * - The list shows the dataset's leads the way the current app has them: a
 *   lead whose quote is approved becomes a customer and leaves the list, so
 *   LD-060 (approved in the dataset) is not on it.
 * - QT-330 has been emailed to Dev & Anjali Prasad (LD-056) today, so the app
 *   has moved them to Follow-up (`quoteSentToLead`) and the list's Quoted
 *   column shows the quote's stored total as sent: the default pick, stairs
 *   not added ($7,571.93 — the app's figure in the reference screenshots).
 * - Meadowbrook Villas HOA's follow-up is two days late, so the stats line's
 *   overdue count and the red dot have something to show.
 * - Leads carry their city as the address: the site never shows a street.
 */
import { counters, DEMO_TODAY, demoDate, incomingLeads, leads, reps, thread } from './sample-data';
import { LC_QUICK_SOURCES, quoteSentToLead, type ListLead, type ListQuote, type QuickAddValues } from '../lib/logic';

const QUOTE = thread.quote;

const toList = (l: (typeof leads)[number]): ListLead => ({ ...l, address: l.city, notes: [] });

export const heroLeads: ListLead[] = leads
  .filter((l) => l.status !== 'approved' && l.status !== 'lost')
  .map((l) => {
    if (l.id === thread.lead.id) return toList(quoteSentToLead(l, QUOTE.number, 'email', DEMO_TODAY)?.lead ?? l);
    if (l.number === 'LD-059') return toList({ ...l, followUpDate: demoDate(-2) });
    return toList(l);
  });

/** QT-330 as it is stored on the day it is sent (the app writes the "as sent" totals). */
export const heroQuotes: ListQuote[] = [
  { id: QUOTE.id, leadId: QUOTE.leadId, number: QUOTE.number, total: QUOTE.totalsAtSend.total, status: 'sent', createdAt: QUOTE.createdAt },
];

/**
 * New leads the idle demo types into the quick add bar, in order. Only the
 * ones whose source is one of the bar's choices (Google, Referral, Facebook,
 * Website, Other): the bar cannot pick "Phone" or "Home Show". The quick add
 * gives them their LD number from the counter, as the app does.
 */
export const heroIncoming: QuickAddValues[] = incomingLeads
  .filter((l) => (LC_QUICK_SOURCES as readonly string[]).includes(l.source))
  .map((l) => ({ type: l.type, name: l.name, phone: l.phone, email: l.email ?? '', address: l.city, source: l.source, salesRepId: l.salesRepId }));

/**
 * The person signed in to the sample shop — the office admin the demo video is
 * filmed as (reps[0], Dale Whitaker). Notes added in the hero carry this name,
 * as the app stamps the signed-in user on every note since 2026-10-15.
 */
export const heroUser = { name: reps[0]!.name };

export const heroState = {
  today: DEMO_TODAY,
  leads: heroLeads,
  quotes: heroQuotes,
  reps: reps.map((r) => ({ id: r.id, name: r.name })),
  counters: { lead: counters.lead },
  incoming: heroIncoming,
  user: heroUser,
};
export type HeroState = typeof heroState;
