# FloorLogic app inventory — October 2026

What the current app does, what changed since the August build the site was made from, and what the site must change to match it.

- **Current app** = demo commit `80be9ee` = `landmark-flooring-app` `dd609d2` (2026-10-14). Exported to [tools/video/app-export/](../tools/video/app-export/).
- **August app** = demo `89f41bc` (2026-08-23), app code as of `landmark-flooring-app` `10072ec` (2026-08-21).
- `L####` = line in the new [demo-main-index.html](../tools/video/app-export/demo-main-index.html); `q L####` = new [demo-main-q.html](../tools/video/app-export/demo-main-q.html); other files are named.
- 7-char hashes are `landmark-flooring-app` commits (descriptive messages: `git show <sha>`).
- Read from code and git history only: no live site opened, no database touched.

## 1. What changed since August (most important first)

| # | Change | Where (new code) |
|---|---|---|
| 1 | **A customer's online Approve no longer builds the job.** It marks the quote Approved and emails the reps + owners (the customer's confirmation email is switched off). Staff open the quote and press **Create WO & Invoice** (confirm box). A red banner on Dashboard, Quotes and Projects lists approvals still waiting. (685ecb6, d24387d) **Watch:** unmerged branch `online-approve-safe` (6ef221f) would bring automatic conversion back — re-check before publishing copy. | `AUTO_CONVERT_APPROVED_ON_LOAD=false` L5390; `_quotesAwaitingConversion` L5412; `_renderAwaitingConversion` L5931; `confirmConvertApprovedQuote` L12337; `approveQuoteVerified` L12342 |
| 2 | **Leads can't be approved by hand.** Dropping a card on Approved (or "→ Next" from Follow-up) only shows *"Approve the lead’s quote to move it to Approved."* `approveLead` (made a WO + invoice with no quote) is gone. Quote Approve buttons ask first. (b5ced78) | `advanceLead` L8902; `_leadTryMoveStage` L8917 |
| 3 | **Phone app at `/mobile`** (home-screen installable): Today, Leads, Customers, Projects (Quotes / Work orders / Invoices), full quote builder, send, approve. WOs and invoices are read-only there. (3d42800, 0396b89) | bootstrap L4248-4300; `_offerMobileApp` L5505; [mobile.js](../tools/video/app-export/mobile.js) |
| 4 | **Caspar (beta) AI quote helper**: talk a quote through by voice, or photograph a paper quote; it fills the normal builder; "Edit with Caspar" round trip. Uses OpenAI. (1d7e21b, 972d039) | sidebar L4182; `qbOpenCaspar` L4283; `renderCaspar` L4284; [caspar.js](../tools/video/app-export/caspar.js) |
| 5 | **Leads screen rebuilt as a CRM List View (now the default tab)**: quick-add row, searchable list + side panel, stage cards with Today / This Week / This Month / Older. The kanban is the "📋 Pipeline" tab. (e53ad0d) | `renderLeads` L9752; `_lcListViewHTML` L9626; `_lcQuickAddHTML` L9390; `_lcPanelHTML` L9508; `_lcStageCardsHTML` L9615 |
| 6 | **Call Log + Dialpad.** Calls/texts moved from QUO to Dialpad; recorded calls get our own transcript + AI summary; unknown callers no longer become leads automatically ("New call" + **Convert**); leads can be deleted (Recycle Bin, 30 days). (1b02257, 72d5e52, ad11d93) | `_callLogLoad` L11246; `_dialpadPlay` L10966; `_dialpadSendText` L11003; sidebar 📞 badge L4176 |
| 7 | **Pipeline moves jobs on its own** and gains an **Archive** tab: all material lines ordered → Ready to Schedule (or Scheduled if dated); day after install end → Final Invoice; every invoice paid → Costing & Payout; Paid → Archive. Board's Done column removed. (f562737, 61ce048, 98d624f) | `_matMaybeAdvance` L21513; `_plAutoAdvanceSweep` L29503; `JOB_BUCKETS` L21252; `renderJobArchive` L21846; `_jobDateMovesToScheduled` L22078 |
| 8 | **Every install has a Start and an End date** (Schedule Install window, WO header, pipeline). Installer pickers list everyone whose Role is Installer. (9bd6313, 47bebeb) | `_jobInstallSpan` L19390; `openScheduleJobModal` L19435; `saveScheduleJob` L19484; `_activeInstallers` L19907 |
| 9 | **Quote builder rework**: "+ Add line item" menu + search picker replace "Type to add" rows; bundles get an actions tab, an **Areas** field and drag-to-reorder; material-checklist card removed; carpet **SqYd fills the cut length** (12 ft width assumed until set); quantities round only by coverage in the price's own unit; labor rows get "Save Price"; Sales Rep 2 is kept. (6ce9d35, 3e1f61b, 8e788bf, abdc05d, 6c68670, 2f957b8, 8d71154, 544ac82) | `_aliSearch` L14081; `_rollLengthFromQty` L13153; `_lineCoverage` L12227 |
| 10 | **Private label**: a product's "Sold as" style/color name shows on quotes, invoices and WOs; POs keep the maker's real name. (23e9102, 7d22783) | `_plRow` L22786 |
| 11 | **Inventory is one page** (Product List folded in): one row per style, colors grouped; style window with photos, specs, trim, roll width, special price per customer. (868df83, d07e825, 7de4b57) | `renderProductInventory` L23145; `_upsertCustomPrice` L10738 |
| 12 | **Invoices**: due the same day next month (was +30 days); duplicate-invoice warning; emailed from the app (Share → Email, link to pay); card brand + last 4 and check # on the invoice; status follows the balance; Take Payment whenever money is owed; Site column; drag reorder; only the chosen options print. (e24aca8, c448db9, db98677, fc8fb20, 6834d6e, 930e501, bcc2686, ebefc2d, f7200ee, 4549359, 5bd27fe) | `DocumentDates.invoiceDueDate` [document-dates.js](../tools/video/app-export/document-dates.js) L42; `_invFindDuplicates` L18989; `_invDupShow` L19018; `_invDisplayStatus` L7634; `_qemOpenComposer` L26470 |
| 13 | **Job Costing**: opens on the payout queue (paid in full, commission owed); edit/cancel POs; tick quoted materials at company cost; Accounting bills show as costs; PDF previews; margin shown before commission; **Mark Paid** closes the job. (77e9419, c698ea7, f35f14c, 0726ea2, 716eb13, 61ce048) | `renderJobCosting` L32073; `renderJobCostingDetail` L32113; `openJobPOEditModal` L22558; `jcMarkGroupPaid` L29577 |
| 14 | **Order Materials**: dates stay editable on lines that already have a PO; **Est. Freight** per PO counts in job cost. (3e534d1) | `openOrderMaterialsModal` L21032; `_jpoTotal` L22550 |
| 15 | **Google Calendar two-way sync**: each user connects their own calendar; a company calendar carries everything; Calendar page gets Mine / Company. (2fcf5b5, 6b3ff8d) | `_gcal*` L28055-28372; `renderCalendar` L21009 |
| 16 | **Logins from Settings → Users**: create a login, email set-password instructions, set a password. (3c3204f) | `_ulLoginCell` L27786; `_ulOtherLoginsCard` L27794 |
| 17 | **Rep gets an email when a lead is assigned** to them (new or changed). (83d318d, ac5dec1) | server only: `supabase/functions/notify-lead-assigned` |
| 18 | **Contractor Payments report** (Accounting → Reports, any period, CSV/PDF). (3fee565) | L33602 |
| 19 | Lead notes carry over to the customer; reminder pop-ups switched off (bell still lists them); navy sidebar with the FloorLogic logo; payments can't be lost (database guard) + Stripe audit button; every database change is logged (no screen for it). (f630cba, e3412be, dd2e79f, 54434a0, 3fdfb1f, c69b775) | `_carryLeadNotes` L17772; sidebar L4166-4196 |
| — | **Unchanged**: status names and colors for leads, quotes, WOs, invoices (L7621-7644); root palette and Inter font (L10-33); lead card markup and kanban CSS (L2327-2376, L9150); WO header button labels (L16922). |  |

## 2. Feature inventory by area

Sidebar (L4166-4196): **Company** Dashboard, People · **Clients** Leads (📞 new-calls badge + overdue badge), Customers, Samples · **Documents** Projects, Quotes, **Caspar (beta)**, Work Orders, Invoices, + Create Document · **Finances** Accounting, Job Costing · **Inventory** Inventory, Orders · **Settings** Settings, Recycle Bin. *Product List is gone* (folded into Inventory). Navy gradient `#0f1a2e → #1a2d4d → #1e3a5f` (L185), FloorLogic mark + wordmark (L4168-4169), active item `rgba(255,255,255,.12)` + inset 3px `#3B82F6` bar (L209). Topbar: clock/weather, dashboard peek, search, Quick Price & Stock Check, calculator, notes, Privacy Mode 👁, bell, profile.

### 2.1 Leads / CRM
- **Page "Lead Pipeline"** (`renderLeads` L9752): stats line — Active Leads · total · won · lost, Overdue Follow-ups, Avg Age, Win Rate (`_lcStatsHTML` L9381); tabs **📑 List View** (default since e53ad0d; `_leadsResolveView` L9237) · **📋 Pipeline** · **📅 Follow-Up Queue** (off unless switched on in Settings → Leads). "+ New Lead" shows on Pipeline / Follow-Up Queue only.
- **Call Log** card above every view (`_callLogHTML` L11378; starts collapsed, remembered; "N new calls to review"): When · Dir · Number · Name · Email · Address · About. Known numbers link to "Customer/Lead on file"; unknown numbers read "New call" with AI-filled editable boxes and **Convert →** (makes an LD lead with source "Phone Call"). Calls never create leads on their own any more (ad11d93). Sidebar badge "📞 N" (L4176).
- **List View** (`_lcListViewHTML` L9626): one-row quick add — Lead Type, Name\*, Phone\*, Email, Address, Source (Google / Referral / Facebook / Website / Other), Sales Rep, `+ Add lead`, `All fields…` (L9390); list with search, filters (Status, Type, Source, Rep incl. Unassigned, Age) and columns Name+LD# · Customer Type · Status · Phone/Email · Source · Rep · Last Touch · Age · Quoted (L9466); **360px side panel** for the selected lead: stage pills (Approved is a dashed non-button: "Reached automatically when one of this lead’s quotes is approved"), survey + follow-up dates, notes (Ctrl+Enter), inline edit, contacts, open tasks, quotes, samples, last 3 calls, Delete (L9508); **stage cards** under the list, one per stage, rows Today / This Week / This Month / Older that filter the list (L9615).
- **Pipeline** (kanban): New → Site Survey Scheduled → Send Quote → Follow-up → Approved (Lost hidden). Card + rules in §4.1. Search across columns.
- **Automatic lead moves** (same as August): survey date picked → Site Survey Scheduled + "Site survey: …" task, cleared → back to New (`setLeadSurveyDate` L8953); survey date passed → Send Quote + "Send quote to …" task (`_runLeadAutoTransitions` L9076); quote emailed/texted → Follow-up + task due in 3 days (`_onQuoteSentToCustomer` L9038); staff approve the quote → WO-n + IN-n (same number as the quote), the lead becomes a customer (contacts, address → property, notes) and leaves the board (`approveQuote` L12367, `_convertLeadToCustomer` L17786).
- **Stale + follow-up**: per-stage stale days (`LEAD_STALE_DAYS` L8894), follow-up dot/edge (`getFollowUpState` L8897), overdue badge in the sidebar.
- **Reps**: one Sales Rep per lead; quotes/WOs/invoices also carry **Sales Rep 2**, copied on approval. Sales-role logins only see records where they are rep or rep 2 (`scopeRecords`, L6790-6802). Assigning or changing a lead's rep emails the rep "A new lead has been assigned to you!" (DB trigger → `notify-lead-assigned`, Resend).
- **Notes** are date-only on leads and customers (`addLeadNote` L9881); the "who + time" stamp shipped after this build.
- **Lost / delete**: no Lost column; "❌ Mark Lost" on the lead page. Delete (bulk or single) → Recycle Bin for 30 days (`deleteLead` L9886). Share → private link page [l.html](../tools/video/app-export/l.html) (staff only, revocable) or the Landmark-only "Erick button".
- **Lead page** (`renderLeadDetail` L9818): tabs Contacts · Quotes · Samples · Interactions · Actions · Calls · Messages · Notes; header 📞 Call, 📍 Directions, ✏️ Edit, 🔗 Share, ➕ New Quote, ❌ Mark Lost — no Approve.

### 2.2 Quotes — builder (`renderQuoteBuilder` L12651; UI in §4.2)
- **Header** (sticky, L12782-12790): "📝 Quote" + QT # + status pill, "📋 Current Version ▾", ← Back, customer card with "👁 Viewed N×" pill, `✅ Approve` / `❌ Decline` on sent quotes (approve asks first: "✅ Approve QT-n? This wins the job for NAME and creates the work order and invoice, and turns the lead into a customer.", `confirmApproveQuote` L12333), `🔨 Create WO & Invoice` on customer-approved quotes, `📤 Share ▾` (Preview PDF · Export PDF · Email · SMS · Copy Customer Link · Mark Sent; plus the Landmark-only "Erick button"), `💾 Save`, ⚙ (project links, Move to project, Paper view / Full width, Guided mode, Duplicate, Delete), GRAND TOTAL button, `✨ Edit with Caspar`, job-name box.
- **Paper**: letterhead (hard-coded), Quote Number box, Issued / Valid Until (30 days) / **Sales Rep \*** / **Sales Rep 2**, Bill To (+ contact picker for companies, Tax Rate pill, Payment Terms), Site Details (property, contact, address + suite, access notes), sections, 📝 Job Notes (only what someone typed), totals, 📜 Terms & Conditions checkboxes, ✍️ Approval signature lines + **Down Payment %**, footer, Internal Notes. Save needs a customer or lead and a sales rep; versions keep the last 3 unsent + every sent copy ("↩ Revert to This Version"). New quotes start with one "Materials & Labor" section, 7.6% Carson City tax and 50% down.
- **Sections** (⋮ menu: Show Job Area, Mark as Optional, Mark as Pick One, Add to Choice Group, Move, Delete): required, **optional** (customer can "Add to my quote"), **Pick One** (radio rows; only the picked row counts — good/better/best) and **🔀 Options** groups of whole sections the customer can take one or more of ("CHOOSE ONE OR BOTH / OR MORE"; not new — already in August). 📐 Job Area (SqFt / SqYd) + **Apply** fills matching quantities (trim skipped); "📐 Round Labor Up?" offers to match labor to carton-rounded material (L14989-14992).
- **Lines**: "+ Add line item" → material / labor / transitions search (catalog of ~36k products + stock + labor list, `_aliSearch` L14081); cartons round up to whole cartons *only when coverage is in the price's unit* (`_lineCoverage` L12227); carpet SqYd ↔ cut length with roll width (`_rollLengthFromQty` L13153); special customer prices apply automatically ("🏷️ Custom Price"); private-label names ("Sold as …"); ⋮ menu incl. **Save Price** for the customer (materials and labor), Search / Replace (fast on 36k rows), hide line from the PDF, drag to reorder.
- **Bundles**: group lines under a name + **Areas** ("Labor — Areas: kitchen, hallway"), show/hide the bundle total, optional description (prints instead of the item list), drag the whole bundle.
- **Customer copy controls**: per-column "👁 in PDF / 🚫 hidden" pills (Description, Qty, Price, Total), saved per quote (`togglePreviewCol` L11519); per-row hide; per-section totals pill; "Show Materials & Labor breakdown to customer". Down Payment % is only a number on the quote — nothing is paid at approval; the deposit is collected later on the invoice link.
- **Privacy Mode** blurs cost, margin and profit (`qb-private`). **Locked** once approved (amber banner "This quote is locked…"; click a section's 🔒 to unlock; re-locking sends a change order to the work order). Unsaved-changes guard on every way out ("Continue Editing / 💾 Save & Leave / 🗑 Discard").
- **Email** (`_qemOpenComposer` L26470): "📧 Email Quote QT-n" — From picker (company logins, defaults to the rep), To/CC/BCC filled from the contact / property / customer / lead, editable subject ("View your quote from FloorLogic!") + body with a **View Quote** button (link only, no PDF) → Resend. **Text**: Twilio window (§2.12). Sending marks the quote Sent and moves the lead to Follow-up.

### 2.3 Customer quote page — q.html (UI in §4.3)
- Public link (`/q.html?t=<token>`), no login: letterhead, quote number + dates, contact + sales rep(s), BILL TO / SITE DETAILS, sections with optional "Add to my quote" toggles, Pick One rows and choice groups that re-total live, totals with tax, terms & conditions, **✓ Approve Quote**, 💬 Ask a question, Download PDF.
- Approve is one click: no confirm, no typed name, no signature (still allowed after Valid Until). After it: APPROVED stamp + "✓ Quote Approved" card with "Selected options" and "🔒 Locked — changes disabled"; reps + owners get "Customer quote approved" with the PDF (its text still says the WO/invoice were "Created automatically" — stale); the customer gets no email (switched off); staff create the WO + invoice by hand.
- 💬 "Ask a question" chat is labelled "Casper · FloorLogic" but is not AI — it emails the question to the rep.
- The same page is the live invoice (`?inv=1`) and the source of every PDF (`api/quote-pdf.js` renders it headless).

### 2.4 Work orders, Projects pipeline, Orders, scheduling
- **Projects hub** (`renderJobsHub` L15371): tabs 🗂️ Pipeline · 📁 Projects · 🔨 All Jobs · 📝 Quotes · **🗄️ Archive** (new, L15382). Pipeline buckets (`JOB_BUCKETS` L21252): 🧱 Materials ("order or assign from stock") · 🗓️ Ready to Schedule ("materials ordered — needs a date") · 📅 Scheduled · 🧾 Final Invoice · 🧮 Costing & Payout · ⏸️ On Hold. **No Done column**; paid jobs go to Archive (`renderJobArchive` L21846: WO #, Site, Customer, Crew, Install, Value, Paid, Status).
- Board columns have a light header with a 9px colored dot (L21802; Final Invoice's `var(--orange)` is undefined, so its dot is blank). Cards glow "⏰ Nd past install" (from the End date), "🐌 Nd here" (stalled: materials 7, schedule 5, final invoice 7, costing 14 days) or "✨ new"; clicking opens a panel with order/in ticks, Start / End / Installer, "✅ Mark Complete", "💵 Ready for Payment", "⇄ Move stage" (`openJobStatusPanel` L21636).
- **Automatic moves** (owner rules 2026-10-13): last material line *ordered* (stock counts; was *received*) → Ready to Schedule, or Scheduled if dated (`_matMaybeAdvance` L21513); a start date typed anywhere → Scheduled (`_jobDateMovesToScheduled` L22078); day after the End date → Final Invoice; every invoice on the job paid → Costing & Payout (`_plAutoAdvanceSweep` L29503, on load + every 10 min). **Paid is always a click** (WO payout, Job Costing "💰 Mark Paid", People payment, or a board move).
- **Work order screen** (`renderJobDetail` L16824): one status button (§4.4); paper header Issued · **Start** · **End** · Installer (+ "+ Add Installer" = split into WO-n-2 sharing one invoice, `_woGroupInvoice` L19937) · Sales Rep · Sales Rep 2; edits now wait for 💾 Save; Share → PDF in English or **Spanish** (crew copy; line items machine-translated); change orders.
- **Order Materials** (`openOrderMaterialsModal` L21032): per line Quantity · Cost / Unit · PO # (auto "WO-n-1") · Order Date · Est. Delivery (+14 days) · **Est. Freight** (new); PO'd lines lock qty/cost but dates + freight stay editable; Finish → "✓ N POs marked as ordered — WO-n → Ready to Schedule". POs use the maker's real name even for private-label lines.
- **Orders** screen "📦 Purchase Orders" (`renderJobPOs` L22371): tabs 🛠️ Work Order POs · 📋 To Order · 📦 Product Inventory POs; row actions 📤 Mark Ordered, ✓ Receive, **✏️ edit** (new), 🗑️. **PO edit window** (`openJobPOEditModal` L22558): status Pending/Ordered/Received/Cancelled, PO #, vendor, qty, unit cost, dates, freight, live "Job costing after you save" preview; cancelling the last open PO offers "Move to Order Materials".
- **Scheduling**: Schedule Install window Start * / End * / Assigned Installer (L19435); installers = active People whose **Role** contains "installer" (`_activeInstallers` L19907). One installer per WO sheet (more = split). The calendar's own Schedule Install still uses 1-10 day pills, not an End date (L8189).

### 2.5 Invoices & payments
- **List** (`renderInvoices` L17272): stats Total / Unpaid / Deposit / Paid / Outstanding; chips All · Unpaid · Deposit · Paid; columns Invoice # · Name · Customer · **Site** · Total · Balance · Status · Created · Due · Overdue. Badges, counts and Outstanding follow the **balance** (`_invDisplayStatus` L7634): void stays void, otherwise paid / deposit / unpaid by money received.
- **Invoice screen** (`renderInvoiceBuilder` L18331, edit + paper preview in one): header "🧾 Invoice" + number + pill, `💰 Take Payment` (whenever balance > $0.005) or `✅ Paid in Full`, `☐/☑ Final Invoice`, `📤 Share ▾`, `💾 Save`, "Balance Due" button. Paper: Invoice Number box, Issued / Due Date / Sales Rep / Sales Rep 2, Bill To (Tax Rate + **Payment Terms** select), Site Details, lines (drag to reorder), Job Notes, totals, Terms & Conditions checkboxes, **💳 Payment Schedule** (Down Payment %). Below: Tasks, Internal Notes, 💳 Payments card, 📋 Change Order Review (Approve / Deny).
- **Terms**: Due on Receipt · Net 15 · Net 30 · Net 45 · Net 60 · 50% Deposit / 50% on Completion (editable list, Settings → Payment Terms); a customer's default terms prefill the quote and carry to the invoice.
- **Due date** = same day next month (`DocumentDates.invoiceDueDate`, document-dates.js L42); changing Issued offers "📅 Update Due Date?" Keep / Set to (`ibUpdateIssuedDate` L19333).
- **Due now** (what the pay link asks for, `computeDueNow` q L637, same rule on the server): Final Invoice or "Due on Receipt" → full balance; "Net N" → deposit until N days after issue, then full; anything else → Down Payment % (default 50) of the total; minus payments; under $0.50 → nothing due. Caveat: Net-N counts issue + N days while the default Due Date is next month's same day.
- **Take Payment** window (`openTakePaymentModal` L20865): tabs **📝 Record Payment** (Cash / Check + Check # / Bank Transfer / Other, date) and **💳 Charge Card** (Stripe card form in the office). Card payments store brand + last 4 ("Credit Card (Stripe) · Visa ••••4242"). Payments are append-only (a database guard refuses any write that drops one); no refunds in the app.
- **Customer link** = q.html in invoice mode (`/q.html?inv=1&t=…`, `_invoicePublicURL` L6488): Due Now card → "💳 Pay $X by Card" (Stripe, cards only, no ACH), payments table, Download PDF. No terms block and no approval on the invoice page.
- **Email**: Share → Email uses the quote's composer (From picker = company logins, defaults to the rep; To from the contact; editable body with "View & Pay Invoice") → `send-quote-email` (Resend). PDF = q.html rendered headless.
- **Duplicate warning** (`_invDupShow` L19018) on Save, Save & Leave, Create from WO and Merge: "Possible duplicate invoice — … has the same customer, site, line items and total ($X) as an invoice already in the system." with "Open IN-x", "Cancel", "💾 Save anyway".
- **Card fee** 2.9% + $0.30 (editable) is an internal cost in job costing; nothing is added to the customer's bill.

### 2.6 Job costing (UI in §4.6)
- **List** (`renderJobCosting` L32073) opens on the payout queue — scope "💼 Commission due" (paid in full, commission owed); other scopes 💵 Paid in full · Active · Paid / Complete · Has costs · All; sort by commission, paid-in-full, variance, margin or actual cost; Commission Due card; a search with no hits widens to all jobs. Columns: Job · Customer · Sales Rep · Installers · Status · Est. Cost · Materials · Labor · Supplies / Other · Actual Cost · Variance · Margin.
- **Detail**: estimate vs actual per bucket, recorded costs (receipts, contractor payments, freight, supplies, Accounting bills), POs (click to edit), billing, commission sign-off, close-out buttons, PDF previews. Margin is taken **before** commission; Profit after.
- **📦 Quoted materials**: tick WO/invoice material lines at company cost (or search the catalog); lines already costed or on a PO are flagged. **☑️ Supplies** checklist with an editable supply catalog. Vendor and category are pick-lists.
- **Payouts**: WO "💰 Mark as Paid…" → "💵 Add Payment — <installer>" (`openTechPaymentModal` L20755); commission payouts via People. Contractor Payments report in Accounting → Reports.

### 2.7 Inventory, catalog, samples
- **Inventory** (`renderProductInventory` L23145) — "Every product in the catalog, one row per style, with live stock." Joins the ~36k-row catalog and stocked items by mat #; a style = category + vendor + product name, colors folded under it. Stats: Styles, Stocked styles, Low-stock colors, Inventory value (cost, privacy-blurred). Search every word across style, color, mat #, SKU, vendor, private label, description; filters Category, Vendor, In stock / Low / Out / Not stocked; sortable headers; "+ Add ▾" (catalog product, rolled RMAT product, stocked item, rolled stocked item); "📊 Export ▾" Inventory CSV (on hand / allocated / available) + Catalog CSV. The list shows "Stock available" only; the old On-Hand / Allocated / Available columns moved into the style window. Bulk delete here is permanent (not the Recycle Bin).
- **Style window** (`_iuWinHtml` L24285; read-only until ✏️ Edit): product card (vendor, mat #s, SKU, coverage, roll width, "Sold as" private label), cost & retail (carpet: cut vs roll cost per SqYd + retail; hard surface: per unit + pallet price), **special pricing per customer** (one entry covers every color), description + specs (chips per category: fiber, wear layer, AC rating…), colors table with photo, private color name, coverage, roll width, retail and stock ("N on hand · N allocated" → which WOs hold it), color photos (resized in the browser, private storage), **trim & transitions** linked to the floor (+ Add transition creates real trim products), purchase orders (stock + job), **sales history** with most popular colors.
- **Stock**: available = on hand − allocated; carton goods show SqFt first; rolls count in SqYd. WO lines allocate stock; a received job PO adds to Allocated; completing a job consumes it. Stock POs (from the style window, PO-0001…) add on-hand at once — no ordered → received step; their retail is set to 2× cost.
- **Low stock**: per-item "Alert below" (default 50 units); shown as the Low tab, stat and flags only — never a bell or email alert. Quick Price & Stock Check (topbar 📦) shows cost/margin (blurred), on hand / allocated / available and location.
- **Not in the app**: dye-lot tracking (a free-text "Dye Lot" box on stock POs is never shown again), cut or remnant tracking, in-app product import (catalog comes from the Engineered Floors pull or a script).
- **Samples** (`renderSampleCheckouts` L9937): "🎨 Sample Checkouts" — stats Total / Currently Out / Overdue / Returned; filters Active · Out · ⚠ Overdue · Returned · All; columns SC #, Status, Customer / Lead, Product, Checked Out, Due Back (+Nd overdue). New checkout: customer or lead (or a new lead), several products, expected return (default 7 days). Return / return selected / reopen. Overdue badge in the sidebar + bell alerts. Doesn't touch stock.
- **Customers** (`renderCustomers` L10110, `renderCustomerDetail` L10592): stats, filters (Retail / Business / Active Jobs / Open Balance / Tax Exempt); detail tabs Projects (folder cards, default) · Quotes · Work Orders · Invoices · Contacts · Properties · Pricing (product prices + labor rates) · Files · Samples · Interactions · Calls · Messages · Notes; same-folder 🔀 Merge for quotes / WOs / invoices.

### 2.8 Accounting / books (`renderAccounting` L29710)
- Tabs: 📊 Overview (AR/AP, aging, 6 months, spend by category) · 📥 Receivables · 📤 Payables (bills, "From POs", recurring) · 💳 Payments (in + out, card-fee settings, **🔍 Audit Stripe against invoices**, card-detail backfill) · 🧮 Job Costing (rollup) · 💸 Commissions · 🏦 Transactions · 📄 Reports.
- **Bank statements**: import **.xlsx / .xls / .csv** (no PDF) with header detection and duplicate fingerprints; **📌 Auto-Category Rules** ("description contains" → category, first match wins); reconcile by hand or "✨ Suggest Matches" (L32796, L32855, L33025).
- **Reports** (`_RPT_KINDS` L33334): Profit & Loss (cash basis) and **Contractor Payments** (new: per person, any period, source = payments / + job costing / job costing only; CSV + Print).
- **Finance PIN** (optional, L28909-29144): 4-8 digits, re-locks after 30 idle minutes, optional email allow-list; locks Accounting and People pay/compensation and masks finance numbers on the dashboard. It does **not** lock invoices or the Job Costing page.
- Stripe payout report: emailed per payout (CSV attached) by the Stripe webhook — no screen in the app.

### 2.9 Phone app — `/mobile` ([mobile.js](../tools/video/app-export/mobile.js), [mobile.css](../tools/video/app-export/mobile.css))
- Same page, sign-in, data and save rules as the desktop; every write goes through desktop functions (mobile.js L1-13). Desktop opened on a phone offers "📱 Open the phone app" (L5505).
- **Tabs** (`tabsHtml` mobile.js L309-322): Today · Leads (badge = new leads) · **+** · Customers · Projects (menu: Quotes / Work orders / Invoices, each with a "what's waiting" line) · Caspar. Tabs a role can't open are hidden.
- **Today** (mobile.js L586-632): greeting, tiles (Open leads, quotes out $, Won this month $), lists: Surveys coming up, New leads to call, Ready to quote, Follow-ups due, Waiting on the customer, Expiring this week, Drafts to finish, Recent wins.
- **Leads** (mobile.js L636-806): search + stage chips, Call / Text / Email / Directions, tappable stage ribbon (New → Survey → Quote → Follow-up), "Next step" card, survey + follow-up date pickers, notes (add only), last 8 calls & texts with the AI summary line, text "From the FloorLogic line" (Dialpad) or from my phone, Mark lost / Reopen / Delete, new-lead form with duplicate check.
- **Customers** (mobile.js L961-1052): A–Z + search, balance due, quotes, sites, contacts, WOs, invoices, notes, calls & texts.
- **Quotes** (mobile.js L1084-1505): lists by status; detail with sections/bundles/options/totals; Send (Email · Text from FloorLogic (Twilio) · Text from my phone · Share link), Customer view, PDF, **Approve** (confirm → `approveQuoteVerified`), Decline, Duplicate, Archive, Delete.
- **Full quote builder** (mobile.js L1571-2002): customer/lead → site → project; sections, bundles (name, Areas), "Show on the PDF" switches, Add line (Material / Labor / Transitions; catalog searched on the server), carton round-up, carpet SqYd ↔ length, cost · margin per line, Save; "✨ Caspar" pill.
- **Work orders + invoices: read-only** lists and pages (install list without prices; payments + balance), "Open in the full app to edit" (mobile.js L1125-1290).
- **Can't**: take payments, edit/send invoices, schedule or advance WOs, calendar, photos, inventory, job costing, accounting, settings. **No Privacy Mode** on the phone (builder shows "Cost $ · Margin %", mobile.js L1642). No offline mode.
- Install: manifest name "FloorLogic", start `/mobile#/today`, theme `#0074D3`, icons 192/512/maskable + apple 180; iOS gets "Add to Home Screen" steps (mobile.js L2027-2032).
- Look (mobile.css): Inter 15px, bg `#f3f5f9`, cards `#fff` radius 16px, buttons/inputs 48px tall (radius 14/12), frosted 52px header with collapsing 32px/800 title, frosted 62px bottom tab bar with a blue-gradient "+" (`#0074D3 → #005BA8`), bottom sheets (radius 22px, drag to close), dark theme `#0b1018` / `#141b26`.

### 2.10 Caspar (beta) — AI quote assistant ([caspar.js](../tools/video/app-export/caspar.js))
- Desktop page "✨ Caspar **Beta**" (L4284) and phone tab; also "Quote with Caspar" in the phone + menu; "✨ Edit with Caspar" in the builder (L12790). Role permission `caspar`.
- **Talk**: live voice (OpenAI Realtime `gpt-realtime-2.1`, voice "marin", transcripts `gpt-live-transcribe`, English + Spanish), hands-free or "Noisy? Hold to talk", text chat, mute; hangs up after 3 quiet minutes / 30 minutes; draft survives reconnects. Server mints a 120-second key (`api/caspar-session.js`).
- **Scan**: photo of a handwritten quote sheet (HEIC converted in the browser) → `api/caspar-scan.js` (OpenAI `gpt-5.6-sol`, strict JSON) → matches customer, site, contact, rep, terms, labor items; keeps the paper's prices; flags lines/tax/totals that don't add up.
- 15 browser-side tools (find/use/new customer, set site, search products, labor items, add/change/remove line, details, groups/areas, PDF columns, review, open in builder). Boxed flooring rounds to whole boxes; prices = what you said, else the customer's special price, else list price.
- Output: a draft with a Materials and a Labor group (each becomes a bundle with Areas). **It never saves, sends or prices on its own**: "Open in quote builder" fills the normal builder, unsaved. Round trip "Editing QT-xxxx" / "← Back to the quote builder" changes only what Caspar changed (972d039).
- Needs `OPENAI_API_KEY`; missing key = an error line in the chat (feature not hidden). Cost is not in code; an internal ops note says ≈30¢ per voice quote and ≈8¢ per scan (unverified).
- Landmark-tuned: voice prompt names Carson City / Gardnerville / Minden; scan prompt describes Landmark's paper sheet; 7.6% Carson City tax fallback; Pacific time.
- Separate older assistant: floating "🤖 Casper **BETA**" chat (desktop, L28653+; Anthropic Claude via `/api/assistant`) — existed in August. Two near-identical names.

### 2.11 Google Calendar sync (new)
- Each user connects their own Google account (profile menu, or the Calendar page's "Google Calendar" button with a status dot → `openGcalModal` L28442). Only Google **Workspace** accounts on the shop's domain are accepted; personal Gmail is refused.
- Synced: installs (scheduled date → Sales Rep 1 and 2's calendars; app wins), site surveys (all-day → lead's rep; app wins), measurement tasks (date flows back), calendar events (two-way; deleting in Google deletes in the app). Everything also lands on a shared **"FloorLogic — Company"** calendar an admin sets up. The user's own Google events show read-only under "Mine".
- Calendar page (`renderCalendar` L21009): **Mine | Company** switch (`_calScopeSwitchHTML` L28085), legend Installs `#059669`, Measurements `#d97706`, Events `#7c3aed`, Google `#0e7490`; site surveys now show with Measurements.
- Pushed by database triggers + a Vercel cron every 5 minutes (`api/_gcal.js`, `api/gcal*.js`).

### 2.12 Calls & texts
- **Dialpad** (replaced QUO 2026-09-22): calls, voicemail, recordings and texts land on the matching lead/customer. "📞 Calls" tab = "📞 Calls, Recordings & Transcripts": ▶ Play recording, voicemail, "🤖 AI Summary" with next steps, "📝 View transcript" (`_commsRenderCalls` L10913). "💬 Messages" tab = text thread + Send (`_commsRenderMessages` L10948). Settings → "Call & Text Inbox" lists all threads.
- One note per call on the lead/customer ("📞 Call summary … Next steps"); a better summary replaces it.
- Our own transcript (OpenAI `gpt-4o-transcribe-diarize`) + summary/caller details (Claude) when both keys are set; otherwise Dialpad Ai's.
- Setup: Settings → "Phone & Texting (Dialpad)" → admin "🔌 Connect / Re-sync Dialpad" creates the webhook. Its help text is stale ("unknown callers become new leads", L27237).
- Calling is a plain `tel:` link (no click-to-call). Texting: any signed-in user, from the Messages tab or the phone app ("From the FloorLogic line").
- **Quote links by text** use a different service, Twilio (`openQuoteSMSModal` L26278, Share → "SMS"): the window hard-codes "From: FloorLogic (+1 855-457-2197)" — Landmark's real number — and a "⚠ Toll-free verification pending" warning.

### 2.13 Users, roles, PIN, privacy, other
- **Logins** (Settings → Users, `_ulLoginCell` L27786): Login column (has login / disabled, role, last sign-in, ✉️ Email, 🔑 Password) or "+ Create login" (name, email, app role, optional password, "Email them login instructions now" → Resend "Your FloorLogic app login" with a one-time "Choose my password" link → `set-password.html`). "🔐 Other logins" card. Sign-in is email + password only: no self sign-up, no "forgot password".
- **Roles**: app roles are **admin** and **sales** (plus any role already on a profile). Permissions = per-role tick boxes for 16 sections (`APP_SECTIONS` L6640; the screen says it "is not a database restriction"); sales users only see records where they are rep 1 or rep 2 — except the Leads **Pipeline** board, which reads every lead (`data.leads` unscoped, L9776; whether the database filters it first is unverified). Admins can "👁 View as <Role>". "People Roles" (Admin / Manager / Sales Rep / Installer / View Only) are roster labels, not logins.
- **Finance PIN** (see §2.8): optional; locks Accounting and People pay data; not Job Costing.
- **Privacy Mode** (👁, `togglePrivacyMode` L28637): blurs cost, margin and profit (hover reveals) in builders, Job Costing, Accounting, inventory and pipeline values; per-user, anyone can turn it off; not on the phone.
- **Settings** (pop-up over the page, `renderAdmin` L26884): Defaults (Quote Preview, Work Order, Leads, Approval Emails) · System Lists (Categories, Vendors, People Roles, Purchase UOMs, Cost UOMs, Labor Items, Supply Items, Material Checklists, Payment Terms, Customer Types) · Documents (Quote Terms, Invoice Terms) · Automation (Task Templates) · Team & Access (Users, Permissions, Contractors) · Communications (Call & Text Inbox) · APIs (Engineered Floors, Phone & Texting (Dialpad)). **No company / branding tab.**
- **Commissions**: each person's rate on People; two reps split 50/50 (`_jobRepShares` L29357); basis = % of profit (before commission) or % of revenue (Accounting → Commissions).
- **Recycle Bin** (`renderRecycleBin` L16075): projects, quotes, leads, WOs, invoices, customers, files; 30 days, then purged; Restore / Delete Forever. Database change history (every add/edit/delete on 35 tables) exists with **no screen**.
- **Dashboard** (`renderDashboard` L8876): user-built dashboards on a drag grid, 4 templates (Main / Sales / Jobs / Work Orders), 23 widgets (leads, quotes, win rate, pipeline, jobs, schedule, outstanding, revenue, weather, notes, my work, calendar, activity); no inventory or sample widgets. Topbar 📊 peek.
- **Bell + tasks**: alerts for follow-ups, stale leads, overdue samples, past-due invoices, jobs, expiring quotes, tasks; snooze / dismiss; task templates fire on quote approved, job scheduled/started/completed, invoice created/paid. Reminder pop-ups are off.
- **Topbar tools**: notes (assign to a teammate, colors, pin, archive), calculator (Convert sq ft ↔ sq yd, Yardage), clock + weather (Open-Meteo, default Carson City), global search (jobs, invoices, quotes, customers, leads, products, samples), 🐞 bug/feature reporter (with "Copy as prompt"), "🤖 Casper" chat. Profile: My Profile, Google Calendar, Auto dark mode (5pm-6am), dark/light, sign out.

## 3. Integration dependencies — what a new shop gets out of the box

**Tenancy first:** the app is single-tenant. Each shop = its own Vercel deployment + its own Supabase database (`config.js` carries one Supabase URL/anon key; `app_settings` is one row, L4590/L4888). Seat limits and plan tiers are not enforced anywhere in the code. The browser only receives `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `STRIPE_PUBLISHABLE_KEY` (demo `build.js`).

| Feature | Works out of the box? | Needs (per shop) | Landmark-specific / caveats |
|---|---|---|---|
| Leads, customers, quotes + builder, cartons/roll math, WOs, pipeline, scheduling, job costing, inventory, samples, POs, accounting (manual entry, Excel/CSV bank import, rules, reconciliation, P&L, contractor report), roles, PIN, Privacy Mode, Recycle Bin, phone app core, l.html | **Yes** (Supabase + Vercel only) | — | Lead sources and project types are fixed lists; Pacific time hard-coded in date helpers |
| Sales tax on quotes/invoices | **Nevada only** | — | County/city/ZIP tables L7646-7698; elsewhere no rate (Caspar/phone fall back to 7.6% "Carson City"); tax on materials only |
| Company name, address, logo on documents and messages | **No** — code edit per deployment | — | `COMPANY` const L24304 + `LOGO_DATA_URI` L24305; letterhead typed into the invoice paper (L18399, L18464) and q.html (q L1424, q L1752); email sending domain `_QEM_SEND_DOMAIN` L26393; texts hard-code the name (mobile.js L1459/1493). A `company_name` setting (L4633) only feeds the reports and the older in-app quote HTML (L25161) |
| Quote PDF download | Yes | Server headless Chrome (`api/quote-pdf.js`) | — |
| Customer quote link + online approval | Yes | — | Creating the WO/invoice is a staff click |
| All email: quote/invoice send, approval alerts, customer questions, lead-assigned, login instructions, payout report | **No** | **Resend** account + verified sending domain (`RESEND_API_KEY`) | Mail goes out "from" the signed-in staff member on the shop's domain; approval alert always copies hard-coded owner addresses (`ALWAYS_NOTIFY`, notify-quote-approved L52); lead-assigned migration hard-codes the demo function URL and sender |
| Card payments (office + customer pay link), card brand/last 4, Stripe audit, payout report | **No** | **Stripe** account: publishable, secret, webhook secret | No platform fee in code; card fee default 2.9% + $0.30 only feeds job costing (L29175) |
| Text a quote link | **No** | **Twilio** (`TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM_NUMBER`; not in `.env.example`) | Window hard-codes the from-number — **Landmark's real toll-free number** (+1 855-457-2197, shown as "FloorLogic" in the demo) — and a "Toll-free verification pending" banner (L26289-26300). Keep it out of screenshots |
| Calls, recordings, two-way texts, Call Log | **No** | **Dialpad** company account + API key (recordings + message scopes), one admin "Connect" | Only for Dialpad shops; AI prompt says "a flooring company in Carson City, Nevada" |
| Call transcripts + AI summaries | **No** | `OPENAI_API_KEY` + `ANTHROPIC_API_KEY` | Falls back to Dialpad Ai text |
| Caspar (voice + scan quoting) | **No** | `OPENAI_API_KEY` (usage cost per quote) | Prompts tuned to Landmark's towns and paper sheet; shows an error, not hidden, without a key |
| "🤖 Casper" chat assistant | **No** | `ANTHROPIC_API_KEY` | Existed in August |
| Address autocomplete | **No** | Google Maps **Places API (New)** key with billing | Defaults to Nevada + California, northern-Nevada bias |
| Google Calendar sync | **No** | Google Workspace **Internal OAuth app**, `GOOGLE_OAUTH_*`, `GCAL_*`, cron + Supabase Vault secrets | Workspace domain, calendar name and Pacific time hard-coded (`_gcal.js`); personal Gmail refused; not in `.env.example` |
| Engineered Floors catalog/price pull | **No** | EF B2B API + FTP credentials | Settings → Engineered Floors; one vendor |
| Topbar weather | Yes | — | Open-Meteo, no key (L28615) |
| Spanish work-order PDF | Yes (no key) | — | Line items/notes go through Google Translate's unofficial public endpoint (`translate.googleapis.com … client=gtx`, L25674) — can be rate-limited or stop working |
| "Erick button" (quote/WO/invoice/lead Share) | n/a | — | Emails a fixed Landmark staff address — hide in screenshots |

Browser libraries come from public CDNs: supabase-js, Stripe.js, jsPDF 2.5.1 + autotable (PDFs), SheetJS 0.18.5 (Excel import), heic-to (Caspar photos), Inter (Google Fonts).

**What the site may honestly advertise**: everything in row 1 as included. Card payments, email, texting, calls, Caspar, calendar sync and address search should read "connects to your own Stripe / Resend / Twilio / Dialpad / OpenAI / Google account" — they do not work until that account is set up, and the setup is per deployment today (no in-app connect screen except Dialpad and Google Calendar). Nevada-only tax is a real limit for out-of-state shops.

## 4. Exact UI the site's modules must match

App font everywhere: **Inter** 300-800 (Google Fonts, L10). Palette (`:root` L14-33, unchanged since August): primary `#0074D3` / dark `#005BA8`, success `#10B981`, warning/amber `#F59E0B`, danger `#EF4444`, blue `#3B82F6`, indigo `#6366F1`, purple `#8B5CF6`, pink `#EC4899`, gray `#6B7280`, light `#F3F4F6`, border `#E5E7EB`, body `#F8F9FB`, text `#111827`; radius 8px / 12px; shadows `0 1px 3px rgba(0,0,0,.1),0 1px 2px rgba(0,0,0,.06)` and `0 4px 6px -1px rgba(0,0,0,.1),0 2px 4px -1px rgba(0,0,0,.06)`. The app swaps emoji for its own line icons at run time ([icons.js](../tools/video/app-export/icons.js), 24px grid, 1.75 stroke).

### 4.1 Lead kanban card — `leadKbCardHTML` L9150-9213 (unchanged except one line)

```html
<div class="kanban-card" draggable="true" style="border-left-color:EDGE;border-left-width:W">
  <div class="kc-urgency-strip">            <!-- only when overdue / stale -->
    <span class="badge-pill badge-red">📅 Follow-up overdue</span><span class="badge-pill badge-amber">⚠ Stale 9d</span></div>
  <div class="kc-cat-tag-row">🏢 Property Management</div>        <!-- HIDDEN by CSS L2367-2368 -->
  <div class="kc-name-row"><div class="kc-name">[7px dot]Name</div><span class="kc-age">4d</span></div>
  <div class="kc-tags">🛠 LVP · 🌐 Google</div>                  <!-- HIDDEN by CSS L2367-2368 -->
  <div class="kc-chips"><span class="badge-pill badge-indigo">📝 2</span><span class="badge-pill">🎨 1</span></div>
  <div class="kc-meta"><div class="kc-meta-line"><a href="tel:…">📞 (775) 555-0101</a></div>
    <div class="kc-meta-line kc-meta-address">📍 address (one line, ellipsis)</div>
    <div class="kc-meta-line kc-meta-muted">🧑 Rep name</div></div>
  <div class="kc-actions">PRIMARY <button class="btn btn-primary btn-sm btn-icon">📝</button><button class="btn btn-outline btn-sm btn-icon">👁️</button></div>
</div>
```

- **Primary slot by stage**: New → inline date box "📐 [date]" (bg `rgba(37,99,235,.08)`, border `rgba(37,99,235,.25)`, radius 6px, 11px/600 primary; picking a date moves the lead); Site Survey Scheduled → nothing; Send Quote → green `btn-success btn-advance` "→ Follow-up"; Follow-up → nothing (the "→ Approved" button is gone); Approved → "→ Lost" (old quirk; a converted lead normally leaves the board).
- **Edge**: follow-up overdue 4px `var(--danger)`; stale 4px `#f59e0b`; otherwise 3px transparent. **Dot** (7px circle before the name): overdue red, today `#f59e0b`, this week green.
- **Card CSS** (L2332-2363, hover L3166): `#fff`; radius 8px; padding `11px 12px 10px`; gap 7px; shadow `0 1px 2px rgba(15,23,42,.06), 0 0 0 1px rgba(15,23,42,.04)`; hover `translateY(-3px)` + `0 8px 25px rgba(0,0,0,.1)`; name 700 14px/1.3; age 10.5px/600 gray tabular; meta 11.5px (muted/address 11px gray); chips 10px/600, padding `2px 7px`; action bar border-top 1px `#E5E7EB`, padding-top 8px, buttons 11px, padding `5px 8px`; drag = opacity .6.
- **Columns** (L2327-2331): `.kanban` flex, gap 12px, height `calc(100vh - 200px)`; `.kanban-col` **min 240px / max 280px**, flex 1, bg `#F3F4F6`, radius 12px; header padding `12px 16px`, 600 13px uppercase, letter-spacing .3px, white text, sticky; count pill 11px/700 on `rgba(255,255,255,.3)`, radius 10px; drop target = 2px dashed primary outline + `rgba(37,99,235,.06)`.
- **Header colors** (L7622): New `#3B82F6` · Site Survey Scheduled `#6366F1` · Send Quote `#F59E0B` · Follow-up `#EC4899` · Approved `#10B981`. Lost has no column.
- **Inside each column** cards sit in collapsible age groups (`leadKbColumnBodyHTML` L9219): "📥 Today" (≤1 day old), "📆 This Week" (≤7), "📅 This Month" (≤30), "🗂 Older" (closed by default); header 10px/700 uppercase gray on `rgba(0,0,0,.04)`, radius 4px. Empty column: "No leads — drop here".
- **Drop rules** (`_leadTryMoveStage` L8917): Site Survey Scheduled needs a date ("📐 Set a site-survey date on the card first — that auto-moves it here."); Approved is refused ("Approve the lead’s quote to move it to Approved."); Lost asks "Mark NAME as Lost?".
- **Site gaps**: [card-html.ts](../src/lib/board/card-html.ts) shows the lead-type eyebrow and the "project · source" tagline (the app hides both, and did in August too), leaves out the urgency strip and colored left edge, uses a "Set survey date" button instead of the inline date box and "●" instead of 🎨 on the samples chip; the board lets Approved be a drop target that creates a WO + invoice (now refused).

### 4.2 Quote builder — line-item rows and totals (`renderQuoteBuilder` L12651)

- **Paper view is the default** (US-Letter width, L28643-28649); totals dock in the right gutter when there's room.
- **Section card** (`renderSec` L12849): band `#0074D3` (required and Pick One) or `#9333EA` (optional), white 10px/700 uppercase, letter-spacing .06em, padding `5px 10px`, radius `4px 4px 0 0`, drag handle ⇅; body border 1px `#BFDBFE`, bg `#fafbfc`, padding 12px. Optional **"📐 Job Area: [ ] SqFt · Apply"** bar in the info colors (`#EFF6FF` / `#BFDBFE` / `#1D4ED8`).
- **Table** (L13070, `class="qb-line-table"`, 13px): header cells `padding:8px 12px; border-bottom:2px solid var(--border); 11px/700 uppercase gray; letter-spacing .04em` (L12987). Columns: **Show** (or **Pick** in a Pick One section, 44px) · **Line Items** (min 200px) · **Description** (min 200px) · **Qty / UOM** (140px) · **Price** (90px) · **Total** (90px) · **Actions** (80px). Description, Qty, Price and Total headers carry a pill — shown `#d1fae5`/`#047857`/border `#10b981`, hidden `#fee2e2`/`#b91c1c`/border `#ef4444` (10px/700, radius 9); a hidden column's cells turn `#fee2e2`.
- **Rows** (`qbBuildMatRowHtml` L13440 / `qbBuildLabRowHtml` L13462 → `<tr id="qb-row-mat-i">`, border-bottom 1px `#E5E7EB`, cells padded `10px 12px`):
  - first cell: "show in PDF" checkbox, or a radio in a Pick One section, or "↳" for a line inside a bundle (row bg `#f8f7ff`, inset 3px `#c7d2fe`); hidden lines get `#fee2e2`.
  - item: auto-growing text box (13px/500, `#0074D3` for materials, `#9333EA` for labor; border `#e5e7eb`, radius 4; focus ring `0 0 0 2px rgba(0,116,211,.15)`) + "ⓘ Material Info | Available: N" (12px gray), "🏷️ Custom Price" (600 `#B45309`); description box placeholder "Style/Color" (labor: "Details...").
  - qty / UOM / price / total inputs are 32px chips (border `#E5E7EB`, bg `#F3F4F6`, radius 6; focus `#0074D3` + 3px `rgba(37,99,235,.15)` ring); Price and Total are green `#10B981` (Total 700; typing a Total back-solves the price); "💰 Cost $x" / "💰 Set cost" under the price (`qb-private`).
  - Actions: ⇅ drag handle (`#e2e8f0`, border `#cbd5e1`, radius 6; hover primary) + ⋮ menu: 🔍 Search / Replace… · ↺ Reset Price · 🏷️ Save Price for <customer> · ⬆ Move Up · ⬇ Move Down · 👁 Hide from PDF · 🗑️ Delete Row (`qbRowMenu` L14638).
  - Pick One after approval: picked row green wash + inset 4px `#10b981` + "✓ Customer’s Pick"; others `#f8fafc`, opacity .58, struck through, "✗ Not Selected". Draft banner "🔘 Pick One — Default: … Only the picked row counts toward the total." (`#f0f9ff` / `#bae6fd` / `#0c4a6e`).
  - qty hint (`qbBuildQtyExtraHtml` L13425): cartons → **"📦 39 Cartons"** (primary, 700, 12px) **"= 927.03 SqFt"** (gray); carpet → **"📐 52' 6""** (click to edit) + "× 12' roll (assumed)" (11px gray), or red "⚠ set length".
- **Add row**: dashed ghost row with **"+ Add line item"** (`_aliBtnHtml` L14058; 1px dashed `#93c5fd`, radius 6, white, `#0074D3` 13px/600, padding `6px 14px`; purple inside a bundle) → menu **+ Add material / + Add labor / + Add transitions** (L14067) → search window ("Search inventory and the product catalog…"; groups Inventory / Product catalog / Labor; sub-line "mat# • vendor • Avail: N • Sold as …"), first option **"✎ Custom / misc"**.
- **Bundles** ("+ Bundle" / "📦 Bundle Materials & Labor" on the band): framed `tbody` (outline 2px `#818cf8`, offset 3, radius 9, shadow `0 3px 12px rgba(79,70,229,.10)`, 14px gap), header row `#eef2ff`; indigo tab (1.5px `#818cf8`, radius 6, 12px/700 `#4338ca`, 📦 + "Total shown/hidden" ▾ → Unbundle All · Show/Hide bundle total · ✎ Description · Delete Bundle); name (~30%) + **Areas** ("e.g. stairs, loft, 3 bedrooms"); drag by the tab; prints "Name — Areas: …".
- **Locked banner** (L12794, amber): "This quote is locked — The work order and invoice were generated from these line items. Click any section's 🔒 icon to unlock and edit…" (shows right after a customer approval too, before any WO exists).
- **Section totals** under each table: "SECTION TOTALS" 10px/700 uppercase `#6b7280` + pill + table (`_qbSecTotalsTable` L13067).
- **Totals card** (`_computeTotalsData` L27324, `_refreshTotalsRail` L27344; CSS L1504-1526): fixed **248px** card, `#fff`, border 1px `#BFDBFE`, radius 12px, shadow `0 4px 16px rgba(37,99,235,.10), 0 1px 3px rgba(0,0,0,.04)`; head "QUOTE TOTAL" 10px/700 uppercase gray with a "–" to minimize. Rows 12px, padding `5px 16px` (label `#334155`, value 700 `#0f172a` tabular):
  - `🧱 Materials` (label `#d97706`) · `🔨 Labor` (label green) · rule · `Subtotal` · `Tax (8.265%)` or `Tax (Exempt)` (tax on **materials only**) · rule · **GRAND TOTAL** highlight (gradient `#eff6ff → #dbeafe`, border `#BFDBFE`, radius 8px, label 10px/700 `#1e3a8a`, value 16px primary) · rule · `Margin x% · $y` (`qb-private`).
  - Minimized = chip "GRAND TOTAL $x ▾" (value 22px/700). In full-width view the same numbers sit behind the header's GRAND TOTAL button (`.hdr-totals-btn` L1483: gradient `#eff6ff → #f0f9ff`, border `#BFDBFE`, radius 12, value 24px `#0074D3`).
- **Paper totals** (L12907-12931): "🔀 Choice Groups" and "⭐ Optional Add-Ons +$X" lines (purple), optional Materials/Labor breakdown, then **TOTAL** (or "TOTAL (WITH DEFAULTS)" when options exist): label 18px/800 `#0074D3` uppercase, value 20px/800, bg `#e8f0fe`, `border-top:2px solid #0074D3`.

### 4.3 Customer quote page — q.html (small changes since August)

- **Page**: Helvetica/Arial 13px on `#eef0f4`; the "paper" is `#fff`, radius 6px, shadow `0 4px 18px rgba(0,0,0,.06)`, padding `36px 44px` (q L12-14). Same page renders the live invoice (`INV_MODE`) and the PDF.
- **Header** (q L150-171): logo (max 230px) left; right column = **QUOTE NUMBER box** 200px (border 1px `#BFDBFE`, radius 2px; head `#0074D3` white 9.5px/700, letter-spacing .06em; number `#0074D3` 18px/700 Helvetica) + ISSUED / VALID UNTIL rows (labels 9.5px/700 uppercase `#6b7280`, values 11px/600). Under 520px the logo takes its own row and the number box pins right.
- **Meta row**: company contact list + SALES REP / SALES REPS (rep 2 now shown) (q L174-188, q L1334-1340).
- **BILL TO / SITE DETAILS** boxes (q L273-281, q L1342-1360): border 1px `#BFDBFE`, radius 2px; head bar `#0074D3` white 10px/700; `dt` 9.5px/700 uppercase gray, `dd` 11.5px (first value 12.5px/700).
- **Section bands**: `#0074D3` (`.section-h`, 10px/700, padding `5px 12px`); optional sections `#9333EA` with an "OPTIONAL" badge and an **"Add to my quote"** toggle; Pick One rows are tap-to-pick radios; option groups read **"🔀 CHOOSE ONE OR BOTH" / "CHOOSE ONE OR MORE"** (q L1310). Bundles print "Name — Areas: …" (new, q L899-902). Hidden section subtotals now stay hidden here (new, q L1258-1271).
- **Totals** (q L314-330, q L1626): rows 12px `padding:6px 12px`; **grand row** bg `#dbeafe`, `#0074D3`, 18px/700, padding `14px 12px`; optional items listed in purple (`#9333EA` head, `#f3e8ff` dashed "with options" total).
- **Approve** (q L1387-1390, CSS q L451-454): helper "Click below to approve this quote — we'll get started right away." (12px `#666`) + button **"✓ Approve Quote"** — `#10b981`, white, radius 8px, padding `14px 38px`, 15px/700, letter-spacing .02em, shadow `0 4px 12px rgba(16,185,129,.3)`; hover only lifts 1px with shadow `0 6px 18px rgba(16,185,129,.4)` — **the color does not change** (the site's module uses `#047857` → `#065f46` on hover, darker than the app, presumably for white-text contrast — a deliberate difference to keep or drop); disabled `#9ca3af`. One tap, no confirm, no name or signature → toast "Quote approved! Thank you." → page reloads approved (q L773-839).
- **APPROVED state** (q L419-426, q L1373-1388): rubber stamp **"APPROVED"** + date — `#059669`, `border:5px double #059669`, radius 10px, 20px/800, letter-spacing .16em, **rotated −8°** (−4° under 760px), centered at the top of the paper; card "✓ Quote Approved" / "Approved on {date}" / "Selected options: …" (`#d1fae5` bg, `#6ee7b7` border, `#065f46` text, radius 6px) + amber pill "🔒 Locked — changes disabled"; all inputs locked (`.paper.q-locked`). Owner prefers level elements on the site — keep the color/border, decide on the tilt.
- **Ask a question**: 💬 bubble → panel titled "Casper · FloorLogic" (not AI) → "Have a question? Feel free to ask it here and your representative's reply will go to your email." (q L547-555; emails the rep via `ask-quote-question`).
- **What approval does now** (`approve_quote_by_token` q L806 → `notify-quote-approved` q L820): marks the quote approved with the chosen options and emails the reps + owners "Customer quote approved - …" with the PDF. The customer confirmation email is switched off (`SEND_CUSTOMER_CONFIRMATION=false`). It does **not** create the WO/invoice — staff do (§1 #1).
- **Oddities**: a stored 0% tax rate reads as 7.6% here (`Number(q.tax_rate)||0.076`, q L1454); customers can still approve after Valid Until.
- **Invoice mode** (same file): chosen options print as normal sections (no picker), payments list shows "Credit Card (Stripe) · Visa ••••4242" or "Check #1042" (q L594-600), due date defaults to the same day next month.

### 4.4 Work-order header button sequence — `renderJobDetail` L16824 (buttons L16922)

One status-driven button sits after the customer card; `📦 Manage POs` (btn-outline, title "Open the materials order window again") shows on every status except Order Materials. Labels are unchanged since August; what moves the job between them changed.

| Status | Control (exact label · class) | What it does / what moves the job on |
|---|---|---|
| Order Materials | `📦 Order Materials` · btn-primary btn-sm | Order Materials window (L21032). Ordering **every** line jumps straight to Ready to Schedule (or Scheduled if a start date exists) (`_matMaybeAdvance` L21513) |
| Materials Ordered (only some lines ordered) | `✅ Ready to Schedule` · btn-primary, title "Pick an install date and assign an installer" | Schedule Install window |
| Ready to Schedule | `📅 Schedule Install` · btn-primary | Window "📅 Schedule Install · WO-n": **Start date \***, **End date \***, day-count line, **Assigned Installer** (Role = Installer), buttons Cancel / `📅 Schedule` (L19435). Typing a start date in the WO header or a folder view also moves it to Scheduled |
| Scheduled / In Progress | `✅ Mark Job Complete` · btn-success | → Final Invoice. Also happens on its own the day after the End date (`_plAutoAdvanceSweep` L29503) |
| Final Invoice | `📄 View Final Invoice` · btn-warning (only with a linked invoice) | Opens the invoice. When every invoice on the job is paid in full the job moves to Ready to be Paid on its own |
| Ready to be Paid ("Costing & Payout") | `💰 Mark as Paid…` · btn-success; disabled at opacity .5 until an invoice in the WO group is Paid (title "Disabled — the linked invoice must be marked Paid first") | Installer payout window (`openWOPaymentModal` L19553) |
| Paid | text `✅ Paid in Full` (success color, 600 13px) | Job leaves the board → Projects → **Archive** |

- Also in the header: `⚠️ N pending change orders` pill (`#f59e0b`, white, 12px/600, padding `4px 12px`, radius 12px), the sync pill, `📤 Share ▾`, `💾 Save` (keeps the last 3 versions). On Hold / Complete / Cancelled show only Manage POs.
- **Button CSS**: `.btn` inline-flex, gap 6px, padding `8px 16px`, radius 8px, weight 500 (L1451); `.btn-sm` padding `5px 10px`, 12px (L1457); **primary** = `linear-gradient(135deg,#2563EB,#1D4ED8)` + shadow `0 2px 8px rgba(37,99,235,.3)`, hover darker + lift 1px (L3173-3174); **success** = `linear-gradient(135deg,#10B981,#059669)` + `0 2px 8px rgba(16,185,129,.3)` (L3175); **warning** solid `#F59E0B` (L1454); **outline** white, border `#E5E7EB`, hover border/text `#0074D3` (L1456).
- Title block: "🔨 Work Order" 24px/800 primary + WO number 16px/700 gray monospace + status badge.
- Job Costing has its own close-out buttons (L32147-32149): `✅ Mark Complete` → `💵 Ready for Payment` → `💰 Mark Paid` (moves the job to Archive).

### 4.5 Invoice — terms, payment schedule, totals, payments (`renderInvoiceBuilder` L18331)

- **Paper**: `.card.doc-paper`, Arial, labels 9px/700 uppercase `#6B7280` (`_invLbl` L18366).
- **Payment Terms** (L18418): row under a dashed rule (`border-top:1px dashed #ddd`) beside the Tax Rate box (`var(--light)`, `#fef3c7` when exempt); select 12px, padding `5px 6px`, border 1px `#E5E7EB`, radius 3px, first option "— Select —".
- **💳 Payment Schedule** (L18458-18462): bar `#0074D3`, white 10px/700 uppercase, padding `5px 10px`, radius `4px 4px 0 0`; body border 1px `#BFDBFE` (no top), radius `0 0 4px 4px`, padding `14px 16px`, `#fff`; row 12px `#555`: **"Down Payment:"** (600 `#333`) `[50]` (60px input, 13px, centered, radius 3px) **"%"** + gray 11px **"→ $X due upfront"** (= (subtotal + tax) × %).
- **Totals** (L18444-18454, right-aligned table, min 340px): Materials · Labor · Subtotal · Tax (13px, label `#555`, value `#111`, value column 120px) → **TOTAL** row (`#e8f0fe`, `border-top:2px solid #0074D3`, label 18px/800 `#0074D3` uppercase, value 20px/800) → **Paid** `-$x` (`#059669`) → **BALANCE DUE** (bg `#FFF5F5` red `#DC2626` when owing, `#F0FFF4` green `#059669` when paid; label 15px/700 uppercase, value 16px/800).
- **Header**: `☐ Final Invoice` toggle (`.hdr-final-btn` L1469: 13px/600 `#1e3a8a`, radius 8px; on = `#10B981` white with shadow `0 2px 8px rgba(16,185,129,.35)`), "Balance Due" button (`.hdr-totals-btn` L1483: gradient `#eff6ff → #f0f9ff`, border `#BFDBFE`, radius 12px, value 24px red/green, "of $total").
- **💳 Payments card** below the paper (`paymentsHTML` L18364): `.card` radius 12px, padding 20px; title 14px; `💰 Take Payment` = `btn-success btn-sm` (gradient `#10B981 → #059669`, shadow `0 2px 8px rgba(16,185,129,.3)`); table Date · Method · Amount (th 11px uppercase gray, 2px bottom rule; amounts green 600 tabular); method extras " #1042" (mono 11px gray) or " · Visa ••••4242" (11.5px gray); "Paid to date" row on `#F3F4F6`; empty "No payments recorded yet."
- **Take Payment window** (L20865): title "💰 Take Payment — IN-x"; tabs "📝 Record Payment" / "💳 Charge Card" (active tab = primary + 3px underline, L1552); amount prefilled with the full balance; buttons Cancel + "Record Payment" / "💳 Charge Card". Toast "Payment of $X recorded on IN-x".
- **Status pill colors** (badge CSS L1580-1588): unpaid red `rgba(239,68,68,.1)`/`#DC2626`, deposit amber `rgba(245,158,11,.1)`/`#B45309`, paid green `rgba(16,185,129,.1)`/`#059669`, void gray. Quirk: the invoice screen's own header pill shows Unpaid in **gray** (L18376).
- **Customer PAYMENT card** (q L457-473, q L1679-1731): head bar "PAYMENT" (`#0074D3`, 10px/700); card border 1.5px `#BFDBFE`, radius 8px, bg `#F8FBFF`, padding 18px; "DUE NOW" 11px/700 `#005BA8`; amount 26px/800 `#0074D3`; sub-line e.g. "50% deposit — remaining $X due upon completion"; Stripe card box (white, radius 6px); button **"💳 Pay $X by Card"** (`#10b981`, 15px/700, radius 8px, padding `13px 20px`); note "🔒 Secure card payment powered by Stripe". Paid: "✓ Paid in Full" (`#d1fae5` / `#6ee7b7` / `#065f46`).

### 4.6 Job costing — `renderJobCostingDetail` L32113 (redesigned since August)

- **Header**: "🧮 <site address>", customer · WO # · status badge; chips "💼 rep", "👷 installer", amber "⚠ No installer assigned"; status button (see 4.4); doc buttons with an eye that previews the PDF: `🔨 Work Order 👁`, `📦 Order Materials` / `📦 Manage POs`, `📐 Quote QT-n 👁`, `🧾 Invoice IN-n 👁`.
- **Metric strip** (`_jcMetricBar` L32107, used L32170; one card replaces August's five stat cards): Revenue (invoiced/quoted) · Estimated (quoted cost) · Actual (n recorded) · Variance (over/under) · Margin % *before commission* · Profit *after commission* · Sales Tax. Cells (`_jcMetric` L32100): padding `0 16px`, 1px left rule, min-width 92px; label 9.5px/700 uppercase gray; value 15px/700; tones red / green / amber `#b45309` / blue `#0074D3`. Margin and Profit carry `qb-private`.
- **Privacy Mode** (L3591-3594): `[data-privacy="on"] .qb-private{filter:blur(6px)}`, clears on hover; toggle 👁 in the topbar (L4227).
- **"📐 Estimate vs Actual" card** (left column, `minmax(320px,1fr)`):
  - Columns: Bucket · Estimate · Actual · Δ (header 10px uppercase gray, `border-bottom:2px solid var(--border)`).
  - Rows (click opens the bucket): `🧱 Materials` (note "N POs $x + $y in receipts" or "nothing recorded yet — showing quoted"), `🔨 Labor`, `🔩 Supplies & other` (estimate "—", "never estimated on the work order"), `💳 Card processing` (only when there were card fees), **Total Cost**.
  - Cells 13px tabular; Δ red `var(--danger)` when over, green when under, "—" when even; row padding `9px 4px`.
- **Profit box** under it (`qb-private`): green `rgba(16,185,129,.08)` / border `.3` when profitable, red `rgba(239,68,68,.08)` when not; radius 8px; lines Revenue, Sales tax ("not revenue"), − Card processing, − Cost, − Commission, then **Job Profit** 18px/800 and "Margin before commission … · x% after".
- **Billing box**: Invoiced (with tax), Collected (green), **Outstanding**; note "Commissions become payable once this reaches zero…".
- **📦 Purchase orders** list: every PO, "click one to edit" (`openJobPOEditModal` L22558); cancelled ones struck through.
- **"🧾 Recorded Costs" card** (right column, `minmax(320px,1.4fr)`): buttons `➕ Add Cost`, `📦 Quoted materials`, `☑️ Supplies`, `📄 Add Bill` (L32232); table Date · Cost · Who / Where · Amount · Paid; Accounting bills listed as rows too.
- **List page** (`renderJobCosting` L32073): opens on the payout queue (paid in full, commission owed); scopes incl. "Commission due" and "Paid in full"; Commission Due card; sort by commission, paid-in-full, variance, margin or actual cost.
- Cards are `.card` (radius 12px, shadow `0 1px 3px rgba(0,0,0,.1),0 1px 2px rgba(0,0,0,.06)`); Recorded Costs table 13px, header row `#F3F4F6`, th 11px uppercase gray (`_acctTh` L29742), bill rows `#EFF6FF` with a "Bill" badge.
- **Site gaps**: [job-costing.ts](../src/islands/job-costing.ts) models August's page (five stat cards, Margin after commission, PO cost without freight). Rebuild on the strip + two cards above. Some of its `main L…` cites point at the wrong August blocks (e.g. its "profit box" cite, old L26529-26541, was the stat cards; the real profit box was old L26548-26558 → now L32191-32202).

### 4.7 Old → new line map for the site's `main L…` / `q L…` comments

The site's comments cite the August file. Same function, new line:

| Function / const | Old | New | Note |
|---|---|---|---|
| `_toWholeCartons` | 4475 | 5254 | |
| `_ndMarkJobStarted` | 5066 | 6187 | |
| `_isoDay` / `fmtDate` / `daysBetween` | 5847-5863 | 6973-6989 | |
| `LEAD_STATUSES` | 6006 | 7132 | unchanged |
| `LEAD_STATUS_LABELS` … `JOB_STATUS_LABELS` | 6510-6515 | 7621-7626 | unchanged |
| `INV_STATUS_COLORS` | 6516 | 7644 | now after `_invDisplayStatus` L7634 |
| `NV_COUNTY_TAX` … `getTaxRateFromAddress` | 6518-6527 | 7646-7682 | whole-word town match (d8815fc) |
| `showToast` | 6736 | 7895 | |
| `LEAD_STALE_DAYS` / `getFollowUpState` | 7730-7733 | 8894-8897 | |
| `advanceLead` / `kanbanDrop` | 7738 / 7750 | 8902 / 8913 | Approved refused; drop → `_leadTryMoveStage` L8917 |
| `setLeadSurveyDate` | 7779 | 8953 | |
| `leadKbCardHTML` | 7976-8038 | 9150-9213 | only change: no "→ Approved" on Follow-up (L9205) |
| `saveLead` / `changeLeadStatus` | 8139 / 8201 | 9815 / 9866 | |
| `approveLead` | 8225 | — | **deleted** |
| `qbMcDefaultRowKey` / `qbMcChosenRowKey` | 9944 / 9957 | 11988 / 12001 | |
| `qbChosenSectionsAndRows` | 10016 | 12060 | |
| `approveQuote` | 10263 | 12367 | buttons now call `approveQuoteVerified` L12342 |
| `renderQuoteBuilder` (locked banner, Job Area bar) | 10424 (10622, 10680) | 12651 (12794, 12852) | |
| `_qbMcPickLabel` / `_qbSecTotalsTable` | 10879 / 10896 | 13050 / 13067 | |
| `setQBMaterialQty` / `qbRecalcRollQty` | 10961-10972 / 10975 | 13214-13225 / 13228 | carton round-up now `ceil(v/cov − 1e-9)`; is-rolled test → `_isRolledLine` L13134, length → `_rollLengthFromQty` L13153 |
| roll dimensions window | 10984-11007 | 13174-13201 (`_rollDimsOpen`; `qbEditRollDimensions` L13238) | shared by quote / invoice / WO; SqYd → length (6c68670) |
| `qbBuildQtyExtraHtml` | 11207 | 13425 | |
| material row `<tr id="qb-row-mat-…">` | 11251 | 13460 | inside `qbBuildMatRowHtml` L13440 |
| `qbRefreshDownPaymentAmt` / `qbFastRecalc` | 11307 / 11321 | 13517 / 13531 | |
| `woBuildMatRowHtml` | 11585 | 13821 | |
| `applyAreaQty` / `openLaborRoundupModal` / `selectQBClient` | 12662 / 12664 / 12667 | 14989 / 14991 / 14994 | Apply Area now skips trim |
| `_mqTotals` | 13897 | 16243 | |
| `renderJobDetail` (header buttons) | 14472 (14566-14572) | 16824 (16916-16922) | same markup; Mark-as-Paid gate L16832-16835 is split-aware |
| invoice `paymentsHTML` / `_ibDownAmt` | 15990 / 16001 | 18364 / 18375 | |
| `openScheduleJobModal` / `saveScheduleJob` | 16836-16911 | 19435-19522 | Start + End dates; Role-based installers |
| `completeJob` / `markJobPaid` / `openWOPaymentModal` | 16915-16940 / 16941 / 16942 | 19526-19551 / 19552 / 19553 | `completeJob` also runs automatically after the End date |
| `openTechPaymentModal` / `saveTechPayment` | 18134 / 18209 | 20755 / 20830 | |
| `openTakePaymentModal` / `recordPayment` | 18236 / 18355 | 20865 / 21005 | |
| `openOrderMaterialsModal` (modal HTML, submit) | 18381-18547 (18466, 18501) | 21032-21231 (21124, 21164) | 6 fields per line incl. Est. Freight |
| `PIPELINE_STAGES` / `JOB_BUCKETS` | 18554 / 18567-18575 | 21237 / 21252-21259 | Done bucket removed, 2 subtitles reworded |
| `_matMaybeAdvance` | 18814-18825 | 21513-21524 | all *ordered* (not received) → Ready to Schedule |
| `_computeTotalsData` | 23236 | 27324 | |
| `togglePrivacyMode` | 23978 | 28637 | |
| Privacy CSS / topbar toggle | 2989-2992 / 3621 | 3591-3594 / 4227 | |
| `CARD_FEE_PCT_DEFAULT` / `JC_KINDS` | 24517 / 24567 | 29175 / 29236 | |
| `_jobFinance` / `_advanceJobToReady` | 24649-24718 / 24743-24750 | 29379-29457 / 29482-29489 | freight in PO cost; margin before commission |
| `saveJobCost` / `_jcEstimate` | 26112 / 26416 | 31557 / 31872 | |
| `renderJobCosting` / `renderJobCostingDetail` | 26418 / 26482-26560 | 32073 / 32113-32261 | detail page redesigned |
| q `.totals` / `.approved-stamp` / `.pay-h` | 313 / 418 / 456 | 314 / 419 / 457 | |
| q `toast` / `termRule` / `computeDueNow` | 570 / 595 / 612 | 572 / 620 / 637 | |
| q `plusDays` | 575 | — | replaced by `DocumentDates` |
| q `approve` / Pick One rows / `optToggle` | 748-770 / 1154-1176 / 1198-1199 | 773-795 / 1186-1209 / 1231-1232 | |
| q `approvalSection` / totals / PAYMENT card | 1338-1341 / 1578-1613 / 1630-1684 | 1387-1390 / 1626-1662 / 1679-1731 | |

## 5. Site claims now wrong, outdated or missing

Suggested lines are plain and honest. "Owner call" = a pricing/positioning decision, not a fact. The listed site files were read at site commit `627c477`; `src/lib/logic/*` is being edited in parallel (uncommitted), so "site gaps" in §4 may already be partly fixed there.

### [src/data/faq.ts](../src/data/faq.ts)

| Line | Now says | Problem | Suggested replacement |
|---|---|---|---|
| 17-19 | Phones: "runs in any web browser… nothing to install." | There is now a phone version at `/mobile`, installable to the home screen. | "Yes. Reps get a phone version at /mobile: leads, customers, quotes with the full quote builder, and read-only work orders and invoices. Add it to your home screen; there's nothing to download from an app store." |
| 21-23 | Carpet: "Enter the roll width and the cut length and FloorLogic works out the square yards." | Still true, and the reverse is new: typing square yards fills in the cut length. | "Yes. Type the square yards and FloorLogic fills in the cut length from the roll width (12 ft until you set one), or type a length and it works out the square yards. Carpet keeps cut and roll prices per square yard." |
| 25-27 | "…taps Approve. That creates the work order and the invoice." | **False now.** Online approval only marks the quote approved and emails the office; staff click **Create WO & Invoice**. (Unmerged branch `online-approve-safe` would make the old line true again — re-check before publishing.) | "Yes. Each quote has a live link where the customer picks options and taps Approve. You get an email, and one click on the quote creates the work order and the invoice. Invoices have their own link with card payment through Stripe at Stripe’s standard rate. FloorLogic adds nothing on top." |
| 29-31 | No QuickBooks sync | Still true (`quickBooksSync` L26667 is a "coming soon" toast with no button). | Keep. |
| 33-35 | Privacy Mode, PIN, roles | Mostly true, with limits: Privacy Mode *blurs* (hover reveals) and any user can turn it off; it isn't on the phone. The PIN is optional and locks Accounting + People pay, not Job Costing. Roles = which sections a role can open + sales see only their own records (UI-level). | "Yes. Privacy Mode blurs cost, margin and profit with one click. Accounting can be locked behind a PIN, and roles control which screens each person can open; sales reps only see their own customers and jobs." |

### [src/components/site/Origin.astro](../src/components/site/Origin.astro) (the app's sidebar)
- L8 **Inventory group lists "Product List" — removed** (folded into Inventory, 868df83). Use `['Inventory', 'Orders']`.
- L6 Documents group is missing **"Caspar (beta)"** between Quotes and Work Orders (L4182); "+ Create Document" also sits there.
- A **Settings** group (Settings, Recycle Bin) exists; optional to show.
- Look: app sidebar is `linear-gradient(180deg,#0f1a2e 0%,#1a2d4d 40%,#1e3a5f 100%)`; active item `rgba(255,255,255,.12)` + `box-shadow: inset 3px 0 0 #3B82F6` (site uses a border-left and `rgba(59,130,246,.18)`); section labels 11px/600 uppercase `rgba(255,255,255,.4)`; items `rgba(255,255,255,.65)`, radius 8px. Leads shows a blue "📞 N" badge beside the red overdue count.
- Copy (L16-17) is fine.

### [src/config/site.ts](../src/config/site.ts) — `TIERS` (the app has no plan gating; tiers are packaging only)
- Crew "Live quote link with online approval" — true; approval no longer creates the job by itself. Optional: "Live quote link: customer picks options and approves".
- Crew "Email and text delivery" — needs Resend (email) and Twilio or Dialpad (text) set up per shop. Suggest: "Email delivery; texting with your own Twilio or Dialpad number".
- Crew "Work orders, scheduling and calendar" — true; add "start and end dates".
- Shop "Call logging with transcripts" — needs a Dialpad account (+ OpenAI/Anthropic keys for our own transcripts). Suggest: "Call log with recordings and AI call summaries (Dialpad)".
- Shop "Two reps per job and commissions" — true (Sales Rep 2; commission payout queue in Job Costing).
- Ledger "Card payout reports" — needs Stripe + Resend (emailed per payout).
- Ledger "Auto-categorization rules", "Bank statement import and reconciliation", "PIN-locked finance screens" — true (rules L32855+, reconcile L32796, PIN `_finUnlocked` L28933, 30-min idle re-lock).
- **Missing capabilities** (owner call on which tier): phone app at /mobile (include in all — it's the same login); Caspar AI quoting (beta, needs OpenAI, costs per use); Google Calendar two-way sync (Workspace only); contractor payments report + P&L; email to the rep on new leads; bilingual English/Spanish work orders; private-label product names; Recycle Bin (30 days).

### [src/pages/compare.astro](../src/pages/compare.astro)
- L23 "You want a native phone app — FloorLogic runs in the browser… nothing in the app stores." Outdated. Suggest: "FloorLogic has a phone version you add to your home screen from the browser. It isn't in the App Store or Google Play."
- L24 takeoffs: still true. Caspar reads a photo of a *handwritten quote sheet*, not a blueprint — keep the line.
- L22, L25: still true.

### [src/pages/about.astro](../src/pages/about.astro)
- L12 'Where it runs: "In any web browser… No app to install."' Suggest: "In any web browser, plus a phone version you add to your home screen. Nothing to download from an app store."
- L32 story: "the customer approves, materials get ordered…" — fine; optionally "the customer approves and the office turns it into a work order".
- L13 QuickBooks: still true.

### [src/components/site/FeatureCards.astro](../src/components/site/FeatureCards.astro)
| Line | Card | Verdict | Suggested change |
|---|---|---|---|
| 4 | Cartons "39 cartons = 927.03 SqFt" | True (app prints "📦 39 Cartons = 927.03 SqFt", L13425). | Keep. |
| 5 | "Enter the roll width and cut length; square yards fill in. Cut cost and roll cost per yard sit on every roll product." | True, and now also the reverse. | "Type the square yards and the cut length fills in from the roll width — or type the length and get the yards. Cut and roll prices per square yard sit on every carpet." |
| 6 | Pick One: "only their choice counts toward the total" | True. | Optional add: "Or offer whole sections and let them take one or more." |
| 7 | "on hand, allocated and available for every item, rolls included, with low-stock alerts and purchase orders" | True for stocked items, but the three numbers now live in each style's window (the list shows available); low-stock alerts are on-screen flags only, no notification. | "See what's on hand, allocated to jobs and available, rolls included. Low stock is flagged, and purchase orders are a click away." |
| 8 | Samples out / due back / overdue | True (+ bell alert and sidebar badge). | Keep. |
| 9 | "vendor, SKU, cost and price … plus your own private style and color names" | True, and stronger now: the private name is what the customer sees ("Sold as"), while POs keep the maker's name. Rolled (RMAT) products have no SKU field. | "Keep vendor, mat #, cost and price on every product. Sell under your own style and color names — customers see yours, your vendor POs keep theirs." |

- Never claim **dye-lot** tracking (the site's DYELOT easter egg is flavour only; the app doesn't track lots, cuts or remnants).

### [src/components/site/Difference.astro](../src/components/site/Difference.astro)
- Rows still true (trials, prices, "cartons, rolls and square yards in the quote", clickable demo). No app claims to fix. Don't add phone/AI rows without checking each competitor.

### Also outside the listed files (same false claim)
- [pricing.astro](../src/pages/pricing.astro) L15 "Approval creates the work order and invoice" → "One click turns an approved quote into the work order and invoice".
- [HeroBoard.astro](../src/components/site/HeroBoard.astro) L18 "Your customer approves from their phone. The work order and invoice are already waiting." → "Your customer approves from their phone. One click turns it into the work order and invoice." L28/L53 ("drag a lead to Approved"), L36 (sr-only help) and L45 ("Drop a lead here… with a work order and an invoice") describe the removed `approveLead`.
- [living-board.ts](../src/islands/living-board.ts): advancing from Follow-up, the auto-flow step and ArrowRight approve leads and build an invoice "due in 30 days" — none of this exists now. Approved should refuse with the app's toast, or the demo should approve a *quote*.
- [video.ts](../src/data/video.ts) chapter "A lead is won — Drag it to Approved" shows a move the app now refuses.
- [docs/research-2026-10.md](research-2026-10.md): fine; FloorZap's "installer app" is no longer a gap — FloorLogic has /mobile (no installer screens though).
