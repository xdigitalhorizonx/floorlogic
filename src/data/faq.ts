// Visible FAQ text — the same strings feed the FAQPage schema (must match what's on the page).
// Every answer is checked against the demo build's real features (brand.md §2) — no promises
// about anything that isn't built.

export type Faq = { q: string; a: string };

export const HOME_FAQ: Faq[] = [
  {
    q: 'Do I need a credit card for the free trial?',
    a: 'No. The trial is 14 days, with no credit card and no setup fee.',
  },
  {
    q: 'What happens when the 14 days are up?',
    a: 'Pick a plan if you want to keep going. There is no card on file, so nothing is charged automatically.',
  },
  {
    q: 'Can my installers and reps use it on their phones?',
    a: 'Yes. FloorLogic runs in any web browser on a phone, tablet or computer. There is nothing to install.',
  },
  {
    q: 'Does it handle carpet and roll goods?',
    a: 'Yes. Enter the roll width and the cut length and FloorLogic works out the square yards. Cut cost and roll cost per square yard are kept on every roll product.',
  },
  {
    q: 'Can customers approve quotes and pay online?',
    a: 'Yes. Each quote has a live link where the customer picks options and taps Approve. That creates the work order and the invoice. Invoices have their own link with card payment through Stripe at Stripe’s standard rate. FloorLogic adds nothing on top.',
  },
  {
    q: 'Does it sync with QuickBooks?',
    a: 'No. There is no QuickBooks sync. The Ledger plan has its own accounting: receivables, payables, bank statement import and reconciliation.',
  },
  {
    q: 'Can I hide my costs from customers and crews?',
    a: 'Yes. Privacy Mode hides cost, margin and profit with one click, and the finance screens can be locked behind a PIN. Roles control what each person sees.',
  },
  {
    q: 'Who makes FloorLogic?',
    a: 'Digital Horizon in Carson City, Nevada. It was built inside Landmark Flooring, a working flooring store, and runs that store every day.',
  },
];

export const PRICING_FAQ: Faq[] = [
  {
    q: 'Which plan should I pick?',
    a: 'Crew if up to three people quote, install and bill. Shop if you have reps, crews and stock to track: it adds job costing, purchase orders, inventory and samples. Ledger if you want the books in FloorLogic too.',
  },
  {
    q: 'Is there a setup fee?',
    a: 'No. There is no setup fee on any plan.',
  },
  {
    q: 'What does yearly billing save?',
    a: 'Two months. Crew is $1,490 a year, Shop is $2,990 and Ledger is $5,490.',
  },
  {
    q: 'Are there per-user charges inside a plan?',
    a: 'No. Crew covers up to 3 users, Shop up to 10, and Ledger is unlimited.',
  },
  {
    q: 'What do card payments cost?',
    a: 'Customers pay invoices by card through Stripe at Stripe’s standard rate, billed by Stripe. FloorLogic adds nothing on top.',
  },
  {
    q: 'Do I need a credit card to try it?',
    a: 'No. The trial is 14 days with no credit card.',
  },
];
