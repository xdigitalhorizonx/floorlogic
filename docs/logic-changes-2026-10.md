# FloorLogic app logic: August → October 2026

What changed in the real app between the build the site was made from and the one live now, and what the site's demos must show because of it.

- **August app:** demo commit `89f41bc` (2026-08-23), index.html 28,047 lines.
- **Current app:** demo commit `80be9ee` = landmark-flooring-app `dd609d2` (synced 2026-10-14), live at floorlogicdemo.vercel.app. Exported to `tools/video/app-export/`: `demo-main-index.html` (34,159 lines), `demo-main-q.html` (1,987 lines) and `document-dates.js`.
- **How it was checked:** each rule was read in the app code, then ported to `src/lib/logic/`.
  - `tests/parity/` runs the app's real functions next to the ports, over grids of inputs.
  - Those parity tests run against the export when it is present, otherwise against `tests/parity/fixtures/app-source.json` (171 extracted items).
- **Line numbers** below are lines in the current `demo-main-index.html` ("main") and `demo-main-q.html` ("q").

## 1. Behaviour changes the site's demos must show

### Quote builder: quantities, carpet, tax

- **The phantom-carton bug is fixed in the app.** `setQBMaterialQty`, `qbBuildQtyExtraHtml`, `woBuildQtyExtraHtml`, `applyAreaQty` and `_coverageUnits` now all round with `Math.ceil(qty/cov - 1e-9)`.
  - An exact multiple stays put: 914.71 SqFt at 22.31 per carton is 41 cartons, not 42.
  - The site already used this rule. Parity is now exact, with no allowed exceptions.
- **"Apply area" skips trim.** `applyAreaQty` (main L14989) leaves out materials whose category matches `/trim|transition|mou?lding|nosing/i`.
- **A line takes a product's coverage only when the units agree.** `_lineCoverage` and `_covUnitKey` (main L12218-12227) give a 94" trim piece coverage 0, so a quantity of 1 stays 1.
- **SqYd now fills in the carpet length, in whole inches.** `_rollLengthFromQty` and `_rollInchesFor` (main L13151-13153) compute `round(SqYd × 108 ÷ width)`.
  - Example: 79.12 SqYd on a 12' roll is 59' 4". August gave decimal inches.
  - The SqYd typed is never rewritten.
- **The roll width now comes from several places.** `_rollWidthFor` and `_rollEnsureWidth` look in this order:
  - the line itself;
  - the inventory or catalog row with the same matNum (a number or a legacy `{feet, inches}`);
  - a "15Ft 00In" width in the product name;
  - otherwise 12' for carpet (an RMAT number or a Carpet category), marked "(assumed)".
- **Only SqYd lines get a length.** `_rollQtyIsSqYd` checks this; cove base sold by the roll is in Linear Ft. Clearing the SqYd clears the length.
- **Every rolled row shows the length and a width line.** `_rollQtyExtraHtml` prints e.g. "📐 59' 4"" and "× 12' roll (assumed)" on the quote, invoice and work order alike. August's work-order row showed decimal inches.
- **One Roll Dimensions window is shared by the quote, invoice and work order.** `_rollDimsOpen`, `_rollDimsApply`, `qbApplyRollDimensions` (main L13174-13258):
  - the length follows the SqYd until someone types one;
  - a width change keeps the SqYd;
  - a typed length sets the SqYd and saves the roll length back to the product ("📐 Roll length … ft saved to the product for next time").
- **The tax label keeps up to 3 decimals.** `_computeTotalsData` (main L27324) and `_totalsRowsForType` now print "Tax (8.265%)" and "Tax (7.6%)"; August printed "Tax (8.27%)". The builder's rate pill shows "8.265%".
- **Tax towns must match whole words.** `_nvCityHit`, `_nvCityCounty` and `getTaxRateFromAddress` (main L7658-7682) work like this:
  - a town counts only as whole words, so "Jeanette Dr, Carson City" is no longer billed as Clark County because of "Jean";
  - towns after the street line are checked first, and the longest name wins;
  - a written town beats a ZIP that straddles two counties (89705).
- **Bundles** (not ported to the site):
  - A bundle is a $0 parent row whose children carry the money.
  - In Pick One sections the children follow the parent (`qbFastRecalc` `_mcOk`).
  - A new "Bundle actions" menu (`_bndMenuItems`) holds Unbundle All, Show/Hide bundle total, Description and Delete Bundle.
  - Bundles have a new Areas field; the heading reads "<name> — Areas: …".
  - The builder no longer shows a $ total in the bundle header.
  - The work order drops bundle parents.
- **"+ Add line item" replaces the "Type to add…" rows.** `aliOpenMenu` and `_qbAliAdd` offer "+ Add material", "+ Add labor" and "+ Add transitions", each with a "✎ Custom / misc" option.
- **Private-label names** (`_plRow`, `_plRealName`, main L22744-22827; not ported):
  - quotes, invoices, the customer page and work orders show the label;
  - Order Materials and purchase orders keep the maker's real name.

### Approving a quote; dates on documents

- **An invoice is due the same day next month.** `DocumentDates.invoiceDueDate` makes Oct 15 due Nov 15 and Jan 31 due Feb 28 (or Feb 29); August used +30 days. It is used in `approveQuote`, `createBlankInvoice`, `createInvoiceFromJob`, `_createInvoiceRecord`, `duplicateInvoice` and `_projAddInvoice`.
- **The customer page reads document dates on the document's own day.**
  - Issued, Due and Valid-until (q L884-889) and the live invoice's Net-terms "due Nov 14" (q L1699) use `DocumentDates.dateOnly/addDays`. A UTC-midnight `created_at` keeps its day, and other instants use the Pacific calendar. `plusDays` is gone.
  - With no stored date, a quote is valid 30 days and an invoice is due next month.
- **A quote can no longer be converted twice.** `approveQuote` (main L12367):
  - it refuses while jobs, invoices or quotes failed to load (`_conversionDataTrusted`): "Work orders or invoices did not finish loading. Reload the page before approving, so nothing is made twice.";
  - if a work order OR an invoice already exists (`_quoteConversionOf`), it only re-marks the quote approved. The toast is "Quote already has a work order" or "Quote already has an invoice"; August checked the work order only.
- **Approving goes through a confirm and a server check.**
  - The confirm (`confirmApproveQuote`) reads "✅ Approve QT-330?" / "This wins the job for … and creates the work order and invoice[, and turns the lead into a customer]."
  - Then `approveQuoteVerified` checks the server.
  - A customer approving online no longer creates the work order and invoice by itself (`AUTO_CONVERT_APPROVED_ON_LOAD=false`). The office presses "🔨 Create WO & Invoice" (`confirmConvertApprovedQuote`).
- **An invoice shows only the chosen options.** On the customer page an invoice prints the chosen members of a choice group as plain sections, with no "choose one" picker (q.html INV_MODE). Section subtotals hidden in the builder (`hideSecTotals`) stay hidden for the customer.
- **Payments show their card or check.** `payTypeLabel` (q L594) and `_payCardLine` print "Credit Card (Stripe) · Visa ••••4242" or "Check #1042".

### Leads

- **A lead is never approved by hand.** `advanceLead` (main L8902) and `_leadTryMoveStage` (main L8917, used by board drag-and-drop and the List View panel) answer with the warning "Approve the lead’s quote to move it to Approved."
  - August's `approveLead` (WO and invoice from the lead's estimated value) is gone.
- **A Follow-up card has no "→ Approved" button any more.** See `leadKbCardHTML` (main L9197-9210). An Approved card still offers "→ Lost".
- **Approving a lead's quote is now the only way a lead is won.** `_resolveQuoteLeadToCustomer` and `_convertLeadToCustomer` (main L12301, L17786):
  - the lead becomes a customer and is **removed from the pipeline** (it never sits in Approved);
  - the customer type is kept only for Property Management, Builder or Commercial; anything else becomes Retail;
  - its first property is "Main Office" for a company, "Home" otherwise;
  - notes, contacts and the quote's rep carry over.
- **The List View panel's stage buttons follow the same rules** (`_lcMoveStage`). Their survey refusal is worded "📐 Set a site-survey date first — that auto-moves it here."
- **The Leads screen opens on List View now** (`_leadsResolveView`). The age buckets inside a column are named constants (`LEAD_AGE_BUCKETS`, `_leadAgeBucketKey`, main L9216-9218) with the same thresholds and their open/closed defaults (`leadKbColumnBodyHTML`).
- **These moves are unchanged but are now ported:**
  - `_runLeadAutoTransitions` (main L9076): the survey day arriving moves a lead to Send Quote, with a "Send quote to …" task;
  - `_onQuoteSentToCustomer` (main L9038): emailing or texting a quote moves a lead to Follow-up from any open stage;
  - `_ensureTaskForLeadStage` (main L9058): the task each manual move adds.
- **Calls can create leads** (`_callLogConvert`). The call log creates or confirms leads; a call never changes a lead's stage.
- **Sales Rep 2 is on quotes, work orders and invoices, not leads.** It splits commission 50/50 through `_jobRepShares`, which is unchanged.

### Work orders

- **Materials are done when every line is ordered.** `_matMaybeAdvance` (main L21513) moves the job to Ready to Schedule (or Scheduled if it has a date) once **every material line is ordered**; August waited until every line was received. Because of this:
  - Order Materials covering all lines skips Materials Ordered. The toast is "✓ 4 POs marked as ordered — WO-330 → Ready to Schedule" (`submitOrderMaterials`, main L21164).
  - A new PO on a scheduled job no longer knocks it back to Materials Ordered.
  - With no material lines, the confirm is "This work order has no materials. Mark materials ordered and move it to Ready to Schedule?"
- **The board changed.** `JOB_BUCKETS` (main L21252):
  - Materials reads "order or assign from stock"; Ready to Schedule reads "materials ordered — needs a date";
  - **the Done column is gone**;
  - Paid and Complete jobs go to a new **Archive** tab on the hub (`_jobArchiveList`, `renderJobArchive`, `_jobBucket` → 'archive'): Pipeline | Projects | All Jobs | Quotes | Archive.
- **An install has a start and an end.** `saveScheduleJob`, `_jobInstallSpan` and `_installRangeLabel` (main L19385-19521) store the end as `durationDays`.
  - A start needs its end, and a bad range is refused with the app's wording.
  - Toasts read "📅 WO-330 scheduled for Oct 21, 2026 → Oct 23, 2026 (3 days) · Ruben Ortiz".
  - The empty-dialog warning is now "Pick the install dates or assign an installer".
- **The app moves jobs on its own.** `_plAutoAdvanceSweep` (main L29503) runs on load and every 10 minutes:
  - the day after the install END, the job completes itself as of the end date (`completeJob(…, {auto:true})`) → Final Invoice, or Ready to be Paid if an invoice is already paid;
  - when every invoice on the job is paid, it moves to Ready to be Paid.
- **Split work orders share one invoice.** `_woGroupInvoice` resolves the invoice across the group, which affects the "Mark as Paid…" gate, "View Final Invoice" and `completeJob`. `_advanceJobToReady` moves every sheet of the group.
- **Job Costing can close a job.** `jcMarkGroupPaid` adds "💰 Mark Paid": it closes the job, stamps `paidAt` and moves it to the Archive. `jcMarkGroupComplete` and `jcMarkGroupReady` are the other two lifecycle steps; `markJobPaid` also stamps `paidAt`.
- **Installers are people with the Installer role** (`_activeInstallers`). There is one installer per work-order sheet; a second installer means splitting the work order. `crew` stores the person's id.
- **Purchase orders carry estimated freight and can be edited.** See `_omUpdatePO`, `openJobPOEditModal` and `saveJobPOEdit`. Cancelling the last open PO offers "Move to Order Materials" (`_jpoOfferOrderMaterials`).
- **The board's warning chips changed.** The "sitting too long" clock for Ready to Schedule now starts when materials were ordered (`_plStallInfo`). "Late" counts days past the install END (`_plLateInfo`).

### Money after the sale

- **`_jobFinance` changed in four ways** (main L29379):
  - a PO costs its goods plus estimated freight (`_jpoTotal`);
  - a bill tied to a **cancelled** PO now counts on its own;
  - **Margin is taken before commission**: WO-330 in the sample now reads 38.0% (August read 35.0%);
  - a new `preCommProfit` field holds the profit before commission.
- **Each job's Job Costing page has a seven-figure bar.** `_jcMetricBar` (main L32171-32177): Revenue, Estimated, Actual, Variance ("+$189.13 over" / "−$36.00 under"), Margin (before commission), Profit (after commission), Sales Tax.
  - The list's Variance card now turns red at any amount over (> 0).
- **Job Costing opens on a payout queue.** The default scope is "Commission due": jobs paid in full with commission still owed (`_jcPaidInFull`, `_jcCommissionOwed`, `_jcScopeRows`).
- **Invoice badges, counts and filters read the balance** (`_invDisplayStatus`, main L7634, 0.005 tolerance). The status stored after a payment keeps its exact rule, `recordPayment` / `acctRecordInvPayment`.
- **"💰 Take Payment" shows while more than half a cent is owed** (`_ibCanTakePayment`). August hid it once the status was paid.
- **The app warns about duplicate invoices.** `_invFindDuplicates` and `_invDupGate`: an invoice with the same customer, site, lines and total gets "Possible duplicate invoice" and a "💾 Save anyway" button.
- **Card payments record the card and checks record their number.** `confirmStripeCharge` saves the brand and last 4, `_payWithCheckNo` saves the check number, and every payment gets an id.

## 2. App bugs found (current app)

"Checked" means a parity test or a direct code read confirmed it; "reported" means it was found by reading the code but not run here.

**Rounding and money**

1. **The quote builder's header adds unrounded tax** (`qbFastRecalc` L13605). Its grand total can be 1¢ off its own Subtotal + Tax rows: $9,825.98 + $593.52 shows as $10,419.51. *Checked: the parity test counts these.*
2. **The builder and the customer page format unrounded sums.** At a half-cent tie the display is 1¢ below the stored total. *Checked.*
3. **The quote and invoice Margin row counts sales tax as profit** (`_computeTotalsData` L27324). Materials $1,000 (cost $600) plus labor $500 (cost $300) at 7.6% shows "42.9% · $676.00"; the real figure is 40.0% · $600. *Checked: the parity test reproduces the app's figure.*
4. **The quote, the customer page and the approved invoice can differ by 1¢.** `_mqTotals` rounds, while `approveQuote`, `createInvoiceFromJob` and q.html leave totals unrounded. On QT-5828-like figures the page shows $12,622.20 and the invoice stores 12,622.205, which displays as $12,622.21. *Reported.*
5. **Negative amounts print as "$-…" and float dust as "$-0.00".** `fmt$` (L6968) gives "$-50.00". The invoice totals balance (`bal=grand-paid`, unrounded) can show "$-0.00": -4.4e-16 formats as "-0.00". *Checked.*
6. **Variance shows "−$0.00" when nothing differs.** In `openPersonJobCostsModal` and `openJobCostBucket` a job with nothing recorded shows "−$0.00". *Reported.*
7. **The customer page turns a 0% tax rate into 7.6%** (`Number(q.tax_rate)||0.076`, q L1130, L1454). A non-exempt invoice with rate 0 asks the customer for $76 of tax on $1,000. *Checked in code.*
8. **`createInvoiceFromJob` ignores the work order's tax exemption.** It falls back to 7.6% when there is no quote (L17345). *Checked in code.*
9. **Payment tolerances disagree.**
   - The stored status after a manual payment is exact (`tp>=total`).
   - Badges allow 0.005, card charges and the webhook allow 0.01.
   - Example: a total of 202.00499999999997 paid $202 is stored "deposit" but shown "paid", so `_advanceJobToReady` never fires. *Checked with the app's functions in `tests/parity/due-now.parity.test.ts`.*
10. **The new sweep reads the stored invoice status, which edits never recompute.**
    - `_woGroupPaidInFull` reads `i.status`.
    - `saveInvoiceBuilderEdit`, `approveChangeOrder` and `syncApprovedQuoteToJobAndInvoice` do not update it.
    - Example: a change order adds $120 to a paid $1,000 invoice. It stays "paid", and the job moves to Ready to be Paid with $120 owed. *Reported.*
11. **"No payment is due right now" when a small balance is due.** With Due on Receipt and $0.30 left (under the $0.50 card minimum), the page says the balance "will be due upon completion". *Checked: the parity case reproduces it.*
12. **Job `outstanding` nets across invoices.** If invoice A is overpaid $100 and invoice B is $100 short, the job reads paid in full and enters the payout queue. *Checked in code.*
13. **One PO replaces the whole quoted materials cost.** `matCost` switches to actuals as soon as anything is recorded, so a single PO for the carpet drops the quoted pad from the cost and inflates profit and commission. *Checked in code.*
14. **The work order's tax estimate taxes labor.** Before any invoice exists, `woTax = (subtotal||retail) × rate` includes labor (L29391). *Checked.*
15. **Freight is counted inconsistently.**
    - The Orders "Total" column and PO-sourced bills exclude freight, while job costing includes it.
    - The cancel note quotes the PO cost without freight.
    *Reported.*
16. **The Stripe $0.50 minimum can overcharge.** It turns a $0.30 balance into a $0.50 charge. *Reported.*
17. **The grand total loses its thousands separator after any edit.** `qbFastRecalc` uses `'$'+toFixed(2)` while the first render uses `fmt$`, so $12,622.20 becomes $12622.20. *Reported.*

**Quotes, bundles, labels**

18. **Approving a Pick One choice that is a bundle drops its children.** `qbFilterChosenItems` (L12136-12139) pushes only the $0 parent, so the work order gets nothing and the invoice a $0 row. *Checked in code.*
19. **Approving with no customer selection includes everything.** Every Pick One row and every optional section goes in, so the invoice total is above the quote total (`qbChosenSectionsAndRows`). The app's own comments describe this, and the site models it (`chosenItems`).
20. **"Apply area" misses trim stored as an object category.** `category:{name:'Trim/Transition'}` tests as "[object Object]" (`applyAreaQty`). *Reported.*
21. **The private label leaks.** Re-saving a labelled line from row info (`_saveRowProductEdit` L14818) writes the maker's name back for the customer to see. *Reported.*

**Data and other quirks**

22. **There is still no `--orange` colour.** Final Invoice's solid fill (`var(--orange)`) renders as nothing. *Checked: tested.*
23. **Town-table quirks.** 'crystal bay' maps to Douglas (it is in Washoe), and "Mound House" is spelled 'moundhouse', so a written "Mound House" falls through to the ZIP. *Checked.*
24. **`_nvCityHit` checks only the first occurrence of a town.** "1 Jeanette Rd Jean NV" (no commas) finds no town, because the first "jean" sits inside "jeanette". *Checked in code.*
25. **An Approved card still offers "→ Lost".** It moves the lead with no confirm (`advanceLead`). Unchanged since August.
26. **Dashboard invoice rows mix two statuses.** The badge text is the stored status while the colour comes from `_invDisplayStatus`, so a row can read "unpaid" in green. *Reported.*

**Fixed since August:** the phantom carton on exact multiples. The cancelled-PO bill that August ignored now counts.

## 3. Notes for the site's code (not ported, or ported as new functions)

- **The hero board** (`src/islands/living-board.ts`) still approves leads with `approveLead`, which is now marked `@deprecated` and models the August app.
  - In the current app, `canDrop(lead, 'approved')` refuses with `APPROVE_VIA_QUOTE_TOAST` and `advanceLead(lead)` returns `{kind:'refuse'}`.
  - The card helpers, `cardPrimaryAction` and `followUpState`, already follow the current rules.
- **The work-order demo** (`wo-button.ts`) should:
  - pass `allOrdered: true` when Order Materials covers every line, so the job goes straight to Ready to Schedule;
  - use `saveSchedule` / `installSpan` for start + end;
  - stop expecting a Done column.
- **The job-costing demo** should show `jobCostingMetrics` (the metric bar). `varianceView` is now the list card.
- **The invoice demo** should use `invoiceDisplayStatus` for badges, `canTakePayment` for the Take Payment button and `paymentTypeLabel` for payment rows.
- **Sample data** (`src/data/sample-data.ts`): WO-330's history still walks through Materials Ordered. In the current app, ordering all four lines in one go skips that step. Its invoice is now due 2026-11-15, not 11-14.
