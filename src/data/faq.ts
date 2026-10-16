// Visible FAQ text — the same strings feed the FAQPage schema (must match what's on the page).
// Every answer is checked against the current app (docs/app-inventory-2026-10.md, demo 80be9ee)
// — no promises about anything that isn't built. Owner, 2026-10-15: market Caspar by name, never
// as AI; say today's approval flow (one click makes the work order and invoice).

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
    a: 'Yes. Reps get a phone version of FloorLogic: leads, customers and quotes with the full quote builder, plus work orders and invoices to look up. Add it to your home screen from the browser. There is nothing to download from an app store.',
  },
  {
    q: 'Does it handle carpet and roll goods?',
    a: 'Yes. Type the square yards and FloorLogic fills in the cut length from the roll width, or type a length and it works out the square yards. Cut and roll prices per square yard sit on every carpet product.',
  },
  {
    q: 'Can customers approve quotes and pay online?',
    a: 'Yes. Each quote has a live link where the customer picks options and taps Approve. You see it in FloorLogic right away, and one click on the quote creates the work order and the invoice. Invoices have their own link with card payment through Stripe at Stripe’s standard rate. FloorLogic adds nothing on top.',
  },
  {
    q: 'Does it sync with QuickBooks?',
    a: 'No. There is no QuickBooks sync. The Ledger plan has its own accounting: receivables, payables, bank statement import and reconciliation.',
  },
  {
    q: 'Can I hide my costs from customers and crews?',
    a: 'Yes. Privacy Mode blurs cost, margin and profit with one click. Accounting can be locked behind a PIN, and roles control which screens each person can open. Sales reps only see their own customers and jobs.',
  },
  {
    q: 'What is Caspar?',
    a: 'Caspar builds a quote with you. Talk the job through, or snap a photo of your paper quote sheet, and Caspar fills in the quote builder. You check it, save it and send it.',
  },
  {
    q: 'Does it work with Google Calendar and our phone system?',
    a: 'Yes, if you use them. Installs and site surveys sync both ways with Google Calendar on Google Workspace. Shops on Dialpad get every call and text on the lead, with recordings and call summaries.',
  },
  {
    q: 'Who makes FloorLogic?',
    a: 'Digital Horizon in Carson City, Nevada. It was built inside Landmark Flooring, a working flooring store, and runs that store every day.',
  },
];

export const PRICING_FAQ: Faq[] = [
  {
    q: 'Which plan should I pick?',
    a: 'Crew if up to three people quote, install and bill. Shop if you have reps, crews and stock to track: it adds Caspar, job costing, purchase orders, inventory and samples. Ledger if you want the books in FloorLogic too.',
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
