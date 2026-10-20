/**
 * The Leads list as the current app shows it for the one sample dataset (sample-data.ts, never
 * edited here): the records the lead-list and lead-phone tests run the app's rules on. (Until
 * 2026-10-20 this was the home hero's Leads screen; the Caspar hero replaced it, the tested rules
 * stayed.) Everything is fictional; nothing is invented beyond what the app itself would show.
 *
 * - A lead whose quote is approved becomes a customer and leaves the list, so LD-060 (approved in
 *   the dataset) is not on it.
 * - QT-330 has been emailed to Dev & Anjali Prasad (LD-056) today, so the app has moved them to
 *   Follow-up (`quoteSentToLead`) and the list's Quoted column shows the quote's stored total as
 *   sent: the default pick, stairs not added ($7,571.93 — the app's figure in the reference
 *   screenshots).
 * - Meadowbrook Villas HOA's follow-up is two days late, so the stats line's overdue count and the
 *   red dot have something to show.
 * - Leads carry their city as the address: the site never shows a street.
 */
import { counters, DEMO_TODAY, demoDate, leads, reps, thread } from '../../src/data/sample-data';
import { quoteSentToLead, type ListLead, type ListQuote } from '../../src/lib/logic';

const QUOTE = thread.quote;

const toList = (l: (typeof leads)[number]): ListLead => ({ ...l, address: l.city, notes: [] });

export const listLeads: ListLead[] = leads
  .filter((l) => l.status !== 'approved' && l.status !== 'lost')
  .map((l) => {
    if (l.id === thread.lead.id) return toList(quoteSentToLead(l, QUOTE.number, 'email', DEMO_TODAY)?.lead ?? l);
    if (l.number === 'LD-059') return toList({ ...l, followUpDate: demoDate(-2) });
    return toList(l);
  });

/** QT-330 as it is stored on the day it is sent (the app writes the "as sent" totals). */
export const listQuotes: ListQuote[] = [
  { id: QUOTE.id, leadId: QUOTE.leadId, number: QUOTE.number, total: QUOTE.totalsAtSend.total, status: 'sent', createdAt: QUOTE.createdAt },
];

export const listReps = reps.map((r) => ({ id: r.id, name: r.name }));
export const listCounters = { lead: counters.lead };
