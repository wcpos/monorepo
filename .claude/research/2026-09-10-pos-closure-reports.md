# POS shift and closure reports — what the Z-report contains, stored vs computed, and how the till page divides from the reports page

Research for [wcpos/roadmap#205](https://github.com/wcpos/roadmap/issues/205) (part of [#202](https://github.com/wcpos/roadmap/issues/202)). Primary sources only — official help centres, API references, and the French and German tax authorities' own texts — read 2026-09-10. Anything I could not follow to a primary source is marked **unverified**. The [fiscal compliance groundwork note](https://github.com/wcpos/roadmap/blob/research/fiscal-compliance-groundwork/docs/research/2026-09-11-fiscal-compliance-groundwork.md) is the starting point and is not repeated here; §7 only adds the two closure specifications it cites, at field level.

**Systems covered:** Square, Shopify POS, Lightspeed X-Series and R-Series, Clover, Toast, Loyverse, Odoo POS, plus France (BOFiP) and Germany (DSFinV-K) as the fiscal-grade reference.

---

## 1. Field-level comparison

Sections carried by the **closure/shift report** itself (not by the general back-office sales reports).
● present · ◐ partial or adjacent · ○ absent in primary sources · **?** unverified

| Section | Square | Shopify POS | Lightspeed X-Series | Lightspeed R-Series | Clover | Toast | Loyverse | Odoo POS | FR/DE fiscal |
|---|---|---|---|---|---|---|---|---|---|
| Opening float | ● `opened_cash_money` | ● `cashCountedAtOpen` | ● float, entered at open | ● positive `RegisterWithdraw` | ◐ `LOAD` cash event | ● starting cash, per-drawer default | ● `starting_cash` | ● `cash_register_balance_start` | ● `Anfangsbestand` GV_TYP |
| Cash sales | ● `cash_payment_money` | ● `totalCashSales` | ◐ inside per-type Payments | ● `calculated` on cash row | ● | ● | ● | ◐ computed at report time | ● `Z_Waehrungen` |
| Cash refunds | ● `cash_refunds_money` | ● `totalCashRefunds` | ◐ | ◐ | ● | ● | ● | ◐ | ● |
| Paid in / paid out | ● `cash_paid_in_money` / `cash_paid_out_money` | ● add/remove cash + reason code | ● cash in/out + petty cash in/out, with notes | ● `RegisterWithdraw` rows | ● Cash Log | ● pay ins/pay outs | ● pay in / pay out with comment | ● `statement_line_ids` | ● `Einzahlung`/`Auszahlung`/`Privatentnahme`/`Geldtransit` |
| Expected cash | ● `expected_cash_money` | ● `expectedCashAtClose` | ● per payment type | ● `RegisterCountAmount.calculated` | ◐ "expected deposit" on dashboard | ● Expected Closeout Cash **and** Expected Deposit | ● `expected_cash` | ● `cash_register_balance_end` (computed) | ◐ implied by Kassensturzfähigkeit |
| Counted cash | ● `closed_cash_money` | ● `cashCountedAtClose` | ● Counted ($) | ● `RegisterCountAmount.actual` | **?** | ● Actual Closeout Cash | ● `actual_cash` | ● `cash_register_balance_end_real` | ● |
| Variance | ◐ derived, no named field | ● `totalDiscrepancy`, split opening/closing | ● shortfall / overpayment | ◐ derived client-side | **?** | ● **two**: cash over/short and deposit over/short | ● difference | ● `cash_register_difference` (computed) | ● `DifferenzSollIst` is its own GV_TYP |
| **Counted vs expected for NON-cash tenders** | ○ | ○ | ● every payment type | ● every payment type | ○ | ○ | ○ | ● every payment method | ○ |
| Per payment method totals | ◐ separate report | ◐ on the printed slip, not in the API object | ● | ● | ● by card type | ● | ● `payments[]`, stored | ● | ● `Z_Zahlart` |
| Per tax rate totals | ○ | ○ | ◐ single Taxes line | ◐ | ◐ separate taxes report | ◐ tax total, not per rate | ● `taxes[]`, stored | ● | ● `Z_GV_TYP` × `UST_SCHLUESSEL` |
| Gross / net sales | ◐ Sales Summary report | ◐ `netSales` on session | ● New sales | ◐ | ◐ Sales Overview | ● regionalised definitions | ● `gross_sales` / `net_sales` | ● | ● `Z_UMS_BRUTTO` / `Z_UMS_NETTO` / `Z_UST` |
| Discounts | ◐ | ○ | ● | ◐ | ◐ separate report | ● (comps folded in) | ● `discounts` | ● `discount_number` + `discount_amount` | ● `Rabatt` GV_TYP |
| Refunds / returns | ◐ | ● `totalRefunds` | ◐ | ◐ | ◐ | ● | ● `refunds` + `cash_refunds` | ● separate refund products + refund taxes | ● |
| Voids / cancellations | ◐ restaurants only | ○ | ○ | ○ | **?** | ● voids + removals | ○ | ○ | ● `P_STORNO`, `AVBelegstorno` |
| Tips | ◐ restaurants shift report | ○ (store-wide report only) | ○ | ● End of Day tips report | ◐ tips breakdown toggle | ● cash/non-cash/owed/tip-outs | ● `tip` **and** `surcharge` | ○ | ● `TrinkgeldAG` / `TrinkgeldAN` |
| Transaction count | ○ | ○ | **?** | ○ | **?** | ● # of checks | ○ | ● `nbr_orders` | ◐ via `Z_START_ID`/`Z_ENDE_ID` |
| Per cashier | ◐ `team_member_ids` list | ◐ per-activity staff | ○ | ● open/close employee ids | ● | ● the shift review **is** per cashier | ● opened/closed by | ◐ `user_id` (opener only) | ○ |
| Register / device identity | ● `device{id,name}` | ● `registerName`, `PointOfSaleDevice` | ● register + outlet | ● `registerID` | ● device on each event | ● per drawer | ● `pos_device_id` + `store_id` | ● `config_id` | ● `Z_KASSE_ID`, `Stamm_Kassen` |
| Opened-at / closed-at | ● `opened_at`/`ended_at`/`closed_at` | ● `openingTime`/`closingTime` | ● Opened / Closed | ● `openTime`/`createTime` | ● | ● | ● | ● `start_at`/`stop_at` | ● `Z_ERSTELLUNG`, `Z_BUCHUNGSTAG` |
| Opening / closing note | ○ (`description` only) | ● `openingNote` / `closingNote` | ● cash movement notes | ● `notes` | ● `note` on each event | ● ≤45-char comment | ● comment per cash movement | ● `opening_notes` / `closing_notes` | ○ |
| **Sequence number** | ○ (opaque id) | ○ (GID) | ● "Sequence # / Closure #" | ◐ `registerCountID` | ○ | ○ | **?** (`id` is a UUID) | ● `name` from `ir.sequence`, unique | ● `Z_NR` — ascending, gapless, non-resettable, per till |
| Period grand total | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● *cumul du grand total de la période* |
| **Perpetual grand total** | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● *total perpétuel*, never resets |
| Printed-at / generated-at | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● `Z_ERSTELLUNG` |

**Stored vs computed, at a glance**

| | Closure is a stored record | Numbered | Immutable after close | Fetchable by API as its own object |
|---|---|---|---|---|
| Square | ● `CashDrawerShift` | ○ | ● no write endpoints | ● `GET /v2/cash-drawers/shifts` |
| Shopify POS | ● `PointOfSaleDevicePaymentSession` | ○ | ● "you can't reopen or edit it" | ● `pointOfSaleDevicePaymentSessions` |
| Lightspeed X-Series | ● Register Closure | ● | ● "isn't possible to edit" | ◐ webhook + action, no CRUD resource |
| Lightspeed R-Series | ● `RegisterCount` | ◐ | ● GET-only resource | ● `RegisterCount` |
| Clover | ◐ `Shift` and `CashEvent` are stored; **the closeout is not** | ○ | ○ shifts are editable and deletable | ◐ shifts and cash events yes; **no closeout endpoint exists** |
| Toast | ○ the Z Report and shift review are printouts; only `CashEntry` rows persist | ○ | ○ shifts and drawers can be **reopened** | ○ recompute from `/cashmgmt/v1/entries` + Orders |
| Loyverse | ● the `Shift` **is** the report — tax and payment breakdowns stored on it | **?** | ● read-only API, `shifts.create` fires **on close** | ● `GET /v1.0/shifts` |
| Odoo POS | ◐ `pos.session` row stores 3 cash figures; **everything else recomputed** | ● | ◐ state `closed`, but rescue sessions exist | ● `pos.session` via ORM/XML-RPC |
| FR / DE | ● required by law | ● required | ● required | n/a |

---

## 2. Square

Square has **three** unrelated objects people call "the shift", and keeping them apart is the first lesson here.

- **`CashDrawerShift`** — the drawer reconciliation record, per device, per location ([reference](https://developer.squareup.com/reference/square/objects/CashDrawerShift)).
- **Labor `Shift`**, renamed **`Timecard`** in API version 2025-05-21 — a team member's worked period, with breaks, wage and `declared_cash_tip_money`; a payroll record, not a till record ([Labor API overview](https://developer.squareup.com/docs/labor-api/what-it-does), [deprecated CreateShift](https://developer.squareup.com/reference/square/labor-api/create-shift)).
- **Restaurant "Shift Report"** — a per-employee printout of time worked, tip details, sales summary, category and item sales ([help](https://squareup.com/help/us/en/article/8140-run-shift-report-with-square-for-restaurants)).

**The drawer shift is a stored, three-state document.** `CashDrawerShiftState` is `OPEN`, `ENDED` ("ended but has not yet had an employee content audit") and `CLOSED` ("closed with a completed employee content audit and recorded result") ([enum](https://developer.squareup.com/reference/square/enums/CashDrawerShiftState)). Square's help copy says the same in plain words: "Ending a cash drawer is different than closing a cash drawer. When closing a cash drawer, you are recording the actual amount" ([help](https://squareup.com/help/us/en/article/8344-start-and-end-a-cash-drawer-session)). **That ENDED state is Square's X/Z distinction without the X/Z vocabulary** — the interval is sealed and the expected figure is computed, but the physical count has not yet been recorded. Square uses the words "X report" and "Z report" nowhere.

Its money fields are `opened_cash_money`, `cash_payment_money`, `cash_refunds_money`, `cash_paid_in_money`, `cash_paid_out_money`, `expected_cash_money` ("derived", and "may be negative if events were misrecorded") and `closed_cash_money`; **there is no variance field**, expected minus closed is the caller's arithmetic. People are four separate fields — `team_member_ids` (everyone logged in during the shift) plus `opening_`, `ending_` and `closing_team_member_id`.

The API is read-only — `ListCashDrawerShifts`, `RetrieveCashDrawerShift`, `ListCashDrawerShiftEvents`, no create or update ([guide](https://developer.squareup.com/docs/cashdrawershift-api/reporting)); the list endpoint returns a lighter `CashDrawerShiftSummary` that drops the cash breakdown and the people/device fields ([reference](https://developer.squareup.com/reference/square/objects/CashDrawerShiftSummary)). Events are their own object (`event_type`, `event_money`, `description`, `team_member_id`) with `CASH_TENDER_PAYMENT`, `CASH_TENDER_CANCELLED_PAYMENT`, `CASH_TENDER_REFUND`, `PAID_IN`, `PAID_OUT` visible in Square's examples ([reference](https://developer.squareup.com/reference/square/objects/CashDrawerShiftEvent)); the rest of the enum is **unverified**.

**Page division.** The till page is `≡ More > Reports > Current Drawer` (start drawer, pay in/out, end drawer) and `Drawer History`; the reports page is Dashboard `Reports > Payments > Cash drawers`, with optional Paid In / Paid Out / Device / Location columns. A drawer can be **ended from Dashboard but never started from it**, and once ended remotely you lose the ability to pay in/out to adjust ([help](https://squareup.com/help/us/en/article/8344-start-and-end-a-cash-drawer-session), [help](https://squareup.com/help/us/en/article/8358-view-cash-drawer-reports)). The asymmetry is deliberate: opening is a physical act at the till, closing is a supervisory one.

**Print and export is the odd gap.** Cash drawer reports print or email **from the POS app only** — "cash drawer reports can't be printed or exported from your Square Dashboard at this time" ([help](https://squareup.com/help/us/en/article/8362-print-export-or-email-your-reports)). General Dashboard reports export as CSV.

**Close of Day** is a separate, plan-gated Square-for-Restaurants feature: "the last report your managers may run for the day… check details (checks comped, voided, etc.), gross and net sales, payment methods, category sales, and item sales", behind configurable **Closing Procedures** (close open checks, adjust tips, total cash drawers, clock out team members) ([help](https://squareup.com/help/us/en/article/6594-end-of-day-reporting-with-square-for-restaurants)). It is a POS artefact — **there is no API object for it**. Square's aggregation API is the [Reporting API](https://developer.squareup.com/docs/reporting-api), a cube/measure/dimension query surface with ~15-minute freshness that carries no cash-drawer data at all.

---

## 3. Shopify POS

Shopify replaced its cash model wholesale in API version 2026-04, and both generations are live in the schema, so both matter.

**Legacy: `CashTrackingSession`** — "Tracks the balance in a cash drawer for a point of sale device over the course of a shift", carrying counted `openingBalance`/`closingBalance` against `expectedBalance`, `expectedOpeningBalance` and `expectedClosingBalance`, plus `totalDiscrepancy`, `totalCashSales`, `totalCashRefunds`, `netCashSales`, `totalAdjustments`, opening/closing notes and staff members, `registerName`, and an `adjustments` connection of `CashTrackingAdjustment{cash, note, staffMember, time}` ([reference](https://shopify.dev/docs/api/admin-graphql/latest/objects/cashtrackingsession)).

**Current: `PointOfSaleDevicePaymentSession` + `CashDrawer`** ([session](https://shopify.dev/docs/api/admin-graphql/latest/objects/PointOfSaleDevicePaymentSession), [drawer](https://shopify.dev/docs/api/admin-graphql/latest/objects/CashDrawer), [changelog](https://shopify.dev/changelog/new-retail-cash-management-capabilities)). The session splits the old `closingBalance` into `cashCountedAtOpen`/`cashCountedAtClose` versus `expectedCashAtOpen`/`expectedCashAtClose`, adds `closingAdjustment`, and — importantly for reporting — adds all-tender totals alongside the cash ones: `totalSales`, `totalRefunds`, `netSales` next to `totalCashSales`, `totalCashRefunds`, `netCashSales`. It also carries **`totalsReady: Boolean!`** — an explicit "the aggregation has finished" flag, an honest admission that these numbers are computed asynchronously.

Two structural changes came with it. First, **the drawer is no longer 1:1 with a device** — "Multiple devices can contribute to a single cash drawer" ([merchant changelog](https://changelog.shopify.com/posts/new-cash-management-foundations-for-shopify-pos)), so cash rolls up per drawer via a `CashActivity` ledger while payments stay per device. Second, **reason codes became first-class**: `CashActivity` is an interface implemented by `CashCountActivity` (with `cashCounted`, `cashExpected`, `cashDiscrepancy`, `note`, `reasonCode`), `CashAdjustmentActivity` and `CashTransactionActivity`, with a `cashManagementReasonCodeCreate` mutation for merchant-defined codes ([interface](https://shopify.dev/docs/api/admin-graphql/latest/interfaces/CashActivity)).

**Immutability is stated outright**: "After you close a session, you can't reopen or edit it" ([help](https://help.shopify.com/en/manual/sell-in-person/shopify-pos/cash-register-management/register-sessions-in-shopify-admin)). Like Square, a session can be **closed** from admin but only **opened** at the device, and only one session may be open per device.

**The merchant-facing names differ from the API names**, which is itself instructive: the admin Cash tracking report says **Opening discrepancy**, **Closing discrepancy**, **Gross payments**, **Refunds**, **Net payments**, where the API says `expectedBalance`, `totalDiscrepancy`, `totalCashSales` ([help](https://help.shopify.com/en/manual/sell-in-person/shopify-pos/cash-register-management/cash-tracking-reports-by-location)). Splitting the discrepancy into an **opening** one (previous session's reported close vs this session's opening count) and a **closing** one is a good idea nobody else has: it localises whether the money went missing overnight or during trade.

**Page division.** Till: Register icon → Open session / View open session / Add cash / Remove cash / Close session, then a `Session complete` screen with an optional **Print** that gives "the cash details for this register session and a summary that has all payment types" ([help](https://help.shopify.com/en/manual/sell-in-person/shopify-pos/cash-register-management/register-sessions-in-shopify-pos)). Reports: admin **Point of Sale → Register** and **Cash tracking** (per location and all locations), gated to **POS Pro** and to the staff permissions "View payment register sessions" / "View payment register session history" ([help](https://help.shopify.com/en/manual/sell-in-person/shopify-pos/cash-register-management/cash-tracking-reports-by-location)). Export buttons are literal: **Export summary**, **Export all sessions**, **Export selected sessions**, **Export cash discrepancy summary**. No email.

Shopify's own warning is worth quoting because it defines the boundary between the two pages: "Register sessions aren't for long term reporting… the Expected cash and Discrepancies reports might become inaccurate" if sessions stay open too long — use the Finance and Order reports instead ([help](https://help.shopify.com/en/manual/sell-in-person/shopify-pos/cash-register-management/register-sessions-in-shopify-admin)).

**Gaps**: no sequence number (a GID and a "Register ID" column), no per-tax-rate breakdown anywhere in the close flow, no tips on the session (tips live only in the store-wide Finance Summary), and the words "X report" / "Z report" appear nowhere on `help.shopify.com` or `shopify.dev`.

---

## 4. Lightspeed

Lightspeed is four products, and only two of them are relevant — but the family is the best single illustration of the design space, because different lines made opposite choices.

### X-Series (formerly Vend) — the strongest closure model surveyed

**Every payment type is counted at close, not just cash.** The close screen asks you to "Enter Counted ($) for any other payment types" beside cash ([help](https://x-series-support.lightspeedhq.com/hc/en-us/articles/25534185400347-Opening-and-closing-a-register)), and the API confirms it structurally: `GET /registers/{id}/payments_summary` returns a `payments[]` of `{payment_type_id, payment_type_name, total}` for **every payment type in the account**, and `PUT /registers/{id}/actions/close` takes the same array of counted totals ([guide](https://x-series-api.lightspeedhq.com/docs/registers_closing), [reference](https://x-series-api.lightspeedhq.com/reference/closeregister)). Under is a **shortfall**, over is an **overpayment**.

**The closure is a numbered, immutable, retrievable document.** "**Sequence #**: The unique identifier for the register closure. Also referred to as **Closure #**" ([help](https://x-series-support.lightspeedhq.com/hc/en-us/articles/25534252854043-Using-the-register-closure-report)). "No, once the register has been closed it isn't possible to edit the register" — the sanctioned fix for a mis-keyed count is to offset it in the *next* closure ([help](https://x-series-support.lightspeedhq.com/hc/en-us/articles/25534022428315-Can-I-reopen-or-edit-a-register-closure)). Reporting → Register Closures → **View full details** shows every sale, its products and its payments as recorded for that closure. Accounting integrations treat it as a financial document in its own right — closing creates an accounts-receivable invoice in Xero carrying the float, petty cash and cash movements for that closure ([help](https://x-series-support.lightspeedhq.com/hc/en-us/articles/25534183802779-Register-closure-and-reconciliation-with-Xero)).

Closure summary sections: Outlet, Register, Sequence #, Opened, Closed, New sales, Taxes, Discounts, Account sales, Layaway sales, Delivery and pickup, **Payments broken out by payment type**, and **Cash Movements shown separately from the cash payment total** ([help](https://x-series-support.lightspeedhq.com/hc/en-us/articles/25534252854043-Using-the-register-closure-report)). The float is inside the expected-cash figure but listed separately in Cash Movements ([help](https://x-series-support.lightspeedhq.com/hc/en-us/articles/25533849599003-Does-the-cash-amount-shown-in-the-register-closure-summary-include-the-float)).

**The one thing X-Series gets conceptually right that most others fudge**: Sales and Payments are two different totals and it says so. "Sales" is the value of sales *created* in the window; "Payments" is money *taken* in the window, which may include payment against an on-account sale opened in an earlier closure ([help](https://x-series-support.lightspeedhq.com/hc/en-us/articles/25534288564251-Understanding-sales-and-payments-discrepancies-in-register-closures)).

**X without Z**: there is a documented **spot check** — open the close-out screen, compare expected cash to the drawer, then click Sell to leave without closing ([help](https://x-series-support.lightspeedhq.com/hc/en-us/articles/25533881673499-How-to-perform-spot-checks-on-your-cash-without-closing-the-register)). X-Series never uses X/Z vocabulary.

**Permissions are the interesting part.** Opening, closing and cash movements are **default permissions on every role and cannot be removed** — there is no cashier-vs-manager gate on closing your own register. What *is* gateable is "View register closures and cash movement reports", which controls seeing **past** closures in the back office ([help](https://x-series-support.lightspeedhq.com/hc/en-us/articles/25534171377819-Setting-user-roles-and-permissions)). The cashier closes; the manager browses history.

**Print is once-only.** "the end-of-day closing slip prints only once and cannot be reprinted" as a receipt slip; the documented workaround is the browser's print/save-PDF on the back-office closure detail ([help](https://x-series-support.lightspeedhq.com/hc/en-us/articles/25533979415451-Can-I-re-print-my-end-of-day-closing-slip)). CSV export is per page of closures, never a single closure alone.

**API shape**: closing is an *action* on `Register`, returning the updated `Register` — there is no `register_closure` CRUD resource in the published spec. The closure exists internally (`Register.register_open_sequence_id` is documented as "current closure object's ID") and externally as a **`register_closure.create` webhook** ([webhooks](https://x-series-api.lightspeedhq.com/v2026.01/docs/webhooks)).

### R-Series — the closure record modelled cleanly

`RegisterCount` **is** the closure record, and it is **GET-only** — no POST, PUT or DELETE ([reference](https://developers.lightspeedhq.com/retail/endpoints/RegisterCount/)). Fields: `registerCountID`, `createTime` (the close), `openTime`, `notes`, `registerID`, **`openEmployeeID` and `closeEmployeeID`**, and a nested `RegisterCountAmount[]` with one row per payment type carrying both **`calculated`** (system-expected) and **`actual`** (counted). It is created by `POST /Register/{id}/close.json`; `GET /Register/{id}/calculated.json` is the pre-close expected-totals preview. Cash movements are `RegisterWithdraw` rows with a sign convention (negative = payout, positive = add), and **the opening float is itself a positive `RegisterWithdraw`** ([reference](https://developers.lightspeedhq.com/retail/endpoints/Register-open/)).

R-Series carries the attribution X-Series lacks (`closeEmployeeID`), and X-Series carries the sequence number R-Series only has as a surrogate key. Neither has both.

### S-Series and L-Series — where Lightspeed does say X and Z

S-Series (ShopKeep) is the only surveyed product with a **fully specified printed X and Z report**, and it is the closest thing in the commercial field to a fiscal Z-report layout ([help](https://shopkeep-support.lightspeedhq.com/support/reporting/z-and-x-reports)):

> Register #; Shift #; Report Type; Opening Date & Time; Opening Manager; # Transactions; # New Customers; Opening Amount; Expected Drawer; Short; Cash Sales; Cash Returns; Drops, Payouts, Pay Ins & Purchases; Sales; Discounts; Returns; Net Sales; Gift Card / Gift Certificate / Deposit Issues; Gratuity; Tax; Total Tendered; Tender Types; Credit Card Types; Voided Items / Voided Total; Discarded Items / Discarded Total; Open Sales / Open Sales Total; Printed.

The Z adds **Closing Date & Time** and **Closing Manager**, and swaps Expected Drawer / Short for **Opening Amount, Closing Amount, Over / Short**. Open Sales reset to 0 once the shift closes. Note **`Report Type` and `Printed` are printed fields** — the report states what it is and when it was produced. Reprints are capped: "Z reports can be reprinted for any register shift opened within the past 7 days", configurable down to 2.

L-Series names them explicitly too: "Closing Report (X)" views totals; "Closing Report (Z)" views **and resets** totals and **locks finalized receipts from editing** ([help](https://resto-support.lightspeedhq.com/hc/en-us/articles/360007460293-Enabling-and-viewing-global-X-Z-Closing-reports)). That lock is the sharpest statement in the whole survey of what a Z actually *does*: it is not a report, it is a state transition on the sales it covers.

---

## 5. Clover

Clover is the cautionary example: it has **three separate "closes" that never meet**.

1. **Employee shift** — the Shifts app clock-in/out. The API `Shift` object is `{id, employee, cashTipsCollected, serverBanking, inTime, outTime, overrideInTime, overrideInEmployee, overrideOutTime, overrideOutEmployee}` — a timecard with a cash-tips field bolted on ([reference](https://docs.clover.com/dev/reference/employeegetemployeeshifts)). It is fully CRUD: `POST` creates, `POST` to `{shiftId}` updates, `DELETE` removes.
2. **Cash Log** — the drawer event stream. `CashEvent` is `{type, amountChange, timestamp, note, employee, device, merchant}`, `type` ∈ `LOAD`, `TRANSACTION`, `OPEN`, `ADJUSTMENT`, `COUNT`, `UNLOAD` ([reference](https://docs.clover.com/dev/reference/cashgetallcashevents)). The merchant-facing report columns are just **Event, Amount, Reason, Employee, Date**, and it "only records cash transactions that occur after the app is installed" ([help](https://www.clover.com/en-US/help/run-cash-log-report)). The dashboard derives an expected deposit — "start with cash sales, subtract cash refunds, add cash added, subtract cash removed, subtract cash back… subtract the tips payout" ([help](https://www.eu.clover.com/en-gb/help/cash-log-app/)) — but a first-party counted-cash / over-short screen in the core Cash Log app is **unverified**.
3. **Closeout** — the card batch. "Closeout is the process of closing your open batch and submitting it for clearing, settlement, and funding" ([help](https://www.clover.com/help/closeout-app-close-out-current-batch)). Closing on one device closes orders on **every** Clover device on the account, and after that tips can no longer be entered or edited for those orders ([help](https://www.clover.com/en-GB/help/manual-closeout-method)).

**Closeout is not a persistent object.** There is no `/v3/merchants/{mId}/closeouts` endpoint; the only documented surfaces are the Android `CloseoutRequestIntentBuilder` (which returns a parcelable `Batch`) and the Clover Go SDK's `closeout()` ([docs](https://docs.clover.com/dev/docs/android-payments-api-closeout), [docs](https://docs.clover.com/dev/docs/closeout)). So the one thing Clover *does* close irreversibly is the thing you cannot fetch afterwards.

Clover never says X or Z. Its read-only interim equivalent is simply the Reporting app / Sales Overview, which can be viewed and printed at any time without resetting anything. The closeout report can be viewed under Finances on the dashboard, printed at the device, and — uniquely in this survey — **emailed to the account owner** ([help](https://www.clover.com/en-US/help/get-closeout-report)).

---

## 6. Toast

Toast is the only surveyed system that **uses the words "Z Report" in its own product**, and the way it uses them is instructive.

**The Z Report does not close anything.** It is printed from Close Out Day, is viewable and printable at any time, updates in real time, defaults to the previous 7 days, and — Toast's own words — **"does not turn the day over"** ([help](https://support.toasttab.com/en/article/Close-Out-Day-Z-Report-Auto-Capture)). Toast has no X report because its Z report *is* the X report; the day turns over on a clock (default 4:00 a.m.), whether or not anyone ran it, and paid-but-unclosed checks are auto-captured with $0 tip at that cutoff.

**Z Report sections**: Sales categories, Revenue centers, Sales & taxes summary, Payment details, Server tip outs, Total voids, Total removals, Total discounts, Credit card breakdown, Other payments breakdown, Labor, **Employee over/short**, **Employee signature**, Pay out breakdown, Deposit summary, Delivery. The gross/net definitions are regionalised — US/Canada gross excludes tax; UK/Ireland gross is net + tax.

**Shift review** is the per-employee closeout: close open checks → declare cash tips (with a permission-gated minimum percentage) → reconcile cash and tips → optionally close assigned drawers → clock out ([help](https://support.toasttab.com/en/article/Shift-Review-Overview)). Its report is configured centrally in Toast Web as a **reorderable list of toggleable sections**, one configuration for the whole restaurant — Employee Account (cash in hand, cash in drawer, driver bank, **employee owes / restaurant owes**), Tips & Fees Earned, Credit Tip Audit, Tip Sharing, Sales & Tax Summary, Cash/Credit Per Sales Category, Revenue Centers, Total Voids, Total Removals, Total Discounts, Total Payments, Credit Card Breakdown, Other Breakdown, Pay Outs and **Employee Signature** ([help](https://support.toasttab.com/en/article/Customizing-Shift-Review-Settings)).

**Toast's cash arithmetic is the clearest of any product here** ([help](https://support.toasttab.com/en/article/Cash-Drawer-Reports-Overview)):

- *Expected Closeout Cash* = starting cash + cash in − cash out (deliberately **including** the float)
- *Cash Overage/Shortage* = Expected Closeout Cash − Actual Closeout Cash
- *Expected Deposit* = Actual Closeout Cash − starting balances of all drawers (float **excluded**, it stays in the drawer)
- *Deposit Overage/Shortage* = Expected Deposit − Actual Deposit

Two variances, not one — the drawer count and the banking are separately auditable. Toast also states the most common cause of a shortage is the counter forgetting the float, which is exactly why it spells out which figure includes it.

**Drawers have three states** — Active, **Paused** ("no new cash sales, but Add/Remove Cash still adjusts the closing balance… tagged TO BE COUNTED", created by "Count this drawer later"), and Closed ([help](https://support.toasttab.com/en/article/Use-Cash-Drawers-New-Experience)). That Paused state is Toast's ENDED. And unlike everyone else, **Toast lets you reopen**: shift review has Edit → Re-open shift (erasing prior tip-out and cash-collected entries), and a closed drawer can be reopened via **Adjust Closing Entries**, returning it to Paused. Only the current business week, and only with permission 4.12 Edit Historical Data beyond that.

**Permissions are numbered and granular**, and one is worth stealing outright: **3.17 Blind** hides the expected amount from the employee counting the drawer. Loyverse has the same idea under a different name (see §7). Blind counting is the only control here that actually changes the reliability of the number.

**API**: `GET /cashmgmt/v1/entries?businessDate=` and `GET /cashmgmt/v1/deposits`, both read-only. `CashEntry` = `{guid, date, reason, amount, payoutReason, cashDrawer, undoes, noSaleReason, employee1, type, employee2}` with `type` ∈ `CASH_IN`, `CASH_COLLECTED`, `CASH_OUT`, `NO_SALE`, `PAY_OUT`, `TIP_OUT`, `UNDO_PAY_OUT`, `DRIVER_REIMBURSEMENT`, **`CLOSE_OUT_EXACT`, `CLOSE_OUT_OVERAGE`, `CLOSE_OUT_SHORTAGE`** ([docs](https://doc.toasttab.com/doc/devguide/apiUsingCashManagementApi.html)). Two details to steal: **corrections are `undoes` pointers to the reversed entry, never edits**, and **the close result is itself three typed entry kinds** — the variance is an event in the stream, exactly as DSFinV-K's `DifferenzSollIst` is.

**But there is no shift-review or Z-Report object in the API.** Toast's own cookbook reconstructs a cash report from `/entries` + `/deposits` + configuration + labor + restaurants data, and warns that undo pairs straddle business dates, that `closeoutHour` is per-restaurant and interacts with DST, and that `CASH_COLLECTED` excludes cash tendered at check-payment time ([docs](https://doc.toasttab.com/doc/cookbook/apiHowToCashReports.html)). Those three caveats are precisely the bugs you inherit by recomputing instead of storing.

---

## 7. Loyverse

Loyverse is the smallest product surveyed and has **the most complete stored closure object of any of them**. Its `Shift` is a single record that carries the whole report ([API reference spec](https://developer.loyverse.com/docs/API-Reference__v1.0.yaml), served by [developer.loyverse.com/docs](https://developer.loyverse.com/docs/)):

`id`, `store_id`, `pos_device_id`, `opened_at`, `closed_at`, `opened_by_employee`, `closed_by_employee`, `starting_cash`, `cash_payments`, `cash_refunds`, `paid_in`, `paid_out`, `expected_cash`, `actual_cash`, `gross_sales` ("sum of all payments before discounts but after taxes with type INCLUDED"), `refunds`, `discounts`, `net_sales` ("gross sales minus discounts and refunds"), **`tip`**, **`surcharge`**, **`taxes[]`** as `{tax_id, money_amount}`, **`payments[]`** as `{payment_type_id, money_amount}`, and **`cash_movements[]`** as `{type: PAY_IN|PAY_OUT, money_amount, comment, employee_id, created_at}`.

Note what that list means: **the per-tax-rate and per-payment-method breakdowns are stored on the closure**, not recomputed from orders. `paid_out` and `cash_movements[].money_amount` are documented as "always positive" — the sign lives in the type, not the number, which is the right call for a report you will sum in several directions.

The API is read-only: `GET /v1.0/shifts` and `GET /v1.0/shifts/{shift_id}`, scope `SHIFTS_READ`, with no write scope defined anywhere. The webhook is **`shifts.create` — "fired when a closed shift is created"**. There is no `shifts.update` event. A shift, in Loyverse's model, does not exist until it is closed; closing *is* the creation of the document.

**Loyverse uses X and Z by name.** The X-report is the open-shift view — cash drawer information plus the current sales summary — and printing it "does not close the shift". The Z-report is produced at close and carries cash drawer totals, the sales summary for the entire shift, expected cash, actual cash and the difference; it "will be automatically printed on the connected receipt printer" ([help](https://help.loyverse.com/help/shift-report-sales-summary-pos)).

**Blind counting is a role permission.** Disabling **View shift report** on the Cashier role means "cashiers will only see the Actual cash amount field when closing the shift" — and the same right gates viewing shift history at the POS ([help](https://help.loyverse.com/help/shift-management-loyverse-pos), [help](https://help.loyverse.com/help/how-manage-access-rights-employees)).

**Page division**: at the POS, the Shift menu (open, cash management with pay in/pay out and comments, close, print) plus a **History** list that "shows only the shifts created on the current POS device", with an **Unsynced** marker for shifts whose events haven't uploaded ([help](https://help.loyverse.com/help/how-work-shift-history-pos)). In the Back Office, **Reports → Shifts** lists POS name, opening and closing time, expected cash, actual cash, cash difference, and drills into all pay ins, pay outs and cash transactions; exports are a **Shift summary report** and a **Pay ins and payouts report** ([help](https://help.loyverse.com/help/shift-management-loyverse-pos)). Whether a closed shift can be reopened is **unverified** — the help centre documents no such flow.

That per-device history list plus the Unsynced flag is the most directly transferable idea in this whole note for an offline-first POS: **the till page shows this device's shifts and tells you which ones the server hasn't seen yet**, and the reports page shows every device's, because only the server can.

---

## 8. Odoo POS

Odoo is the one system whose internals are readable, and what they show is a **hybrid**: a stored session row with three cash numbers on it, and everything else recomputed at report time.

**`pos.session` stored columns** ([`pos_session.py`, 18.0](https://github.com/odoo/odoo/blob/18.0/addons/point_of_sale/models/pos_session.py)): `name` (Session ID, from `ir.sequence` code `pos.session`, with `_sql_constraints = [('uniq_name', 'unique(name)')]`), `config_id`, `user_id` ("Opened By"), `start_at`, `stop_at`, `state` ∈ `opening_control` / `opened` / `closing_control` / `closed`, `sequence_number` (per-order counter), `login_number`, `opening_notes`, `closing_notes`, `cash_register_balance_start`, **`cash_register_balance_end_real`** (the counted figure), `cash_real_transaction`, `move_id` (the journal entry), `statement_line_ids` (cash moves), `order_ids`, and `rescue` ("Auto-generated session for orphan orders, ignored in constraints").

**The variance is not stored.** `cash_register_balance_end` ("Theoretical Closing Balance") and `cash_register_difference` are `compute='_compute_cash_balance'` **without `store=True`** — they are recalculated on every read from the session's payments and statement lines. Closing writes exactly one number: `post_closing_cash_details` sets `self.cash_register_balance_end_real = counted_cash` and returns `{'successful': True}`. Everything the closing popup shows comes from `get_closing_control_data()`, which queries orders live each time it is called.

**Sessions chain their floats.** `action_pos_session_open` sets the new session's `cash_register_balance_start` from the previous session's `cash_register_balance_end_real` — Shopify's auto-open behaviour, expressed in the data model.

**The closing popup counts every payment method**, not just cash: `get_closing_control_data` returns `default_cash_details` (name, opening, payment_amount, moves) plus `non_cash_payment_methods[]` with `{name, amount, number, type}` per method, and `amount_authorized_diff` — the configured maximum tolerated difference — alongside `is_manager`. A difference on a non-cash method posts a journal entry titled "Closing difference in %(payment_method)s (%(session)s)" (`_get_diff_account_move_ref`). The variance becomes an accounting fact, not just a report line.

**The session report** is the "Sales Details" report, built by [`report_sale_details.py`](https://github.com/odoo/odoo/blob/18.0/addons/point_of_sale/models/report_sale_details.py) and reachable two ways — `pos.daily.sales.reports.wizard` for one session, `pos.details.wizard` for a date range across configs ([wizard source](https://github.com/odoo/odoo/blob/18.0/addons/point_of_sale/wizard/pos_daily_sales_reports.py), [wizard source](https://github.com/odoo/odoo/blob/18.0/addons/point_of_sale/wizard/pos_details.py)). Its payload carries `session_name`, `config_names`, `state`, opening and closing notes, `nbr_orders`, the date bounds, `products` by category, `discount_number`/`discount_amount`, `payments_per_method`, `cash_rounding_total`, `invoices`, and for cash `final_count`, `money_counted`, `money_difference` and `cash_moves`. Two details are worth copying: **`refund_products` and `refund_taxes` are kept separate from `taxes`** rather than netted, and each tax entry is `{name, tax_amount, base_amount}` — base and tax, not just tax.

**That the same generator serves one session and an arbitrary date range is the tell**: in Odoo the closure report and the period report are the same computation with different bounds. It also means a "closure" printed today and reprinted next year can differ if any underlying order changed.

**X vs Z**: core Odoo uses neither word. Fiscal behaviour is a localisation concern — `l10n_fr_pos_cert` adds the French hash chain and inalterability, `pos_blackbox_be` the Belgian fiscal data module.

**Page division**: opening control and closing control are popups in the POS frontend; **Point of Sale → Orders → Sessions** is the back-office list, where a session row shows the stored figures and links to its journal entry.

---

## 9. The fiscal reference: what a legally-required closure carries

### France — BOI-TVA-DECLA-30-10-30

Closures are the one prescriptive part of the French doctrine, at § 170 ([BOFiP, version of 25/03/2026](https://bofip.impots.gouv.fr/bofip/10691-PGP.html/identifiant=BOI-TVA-DECLA-30-10-30-20260325)):

- Cash software "doivent prévoir obligatoirement une clôture journalière et une clôture mensuelle et annuelle" (or per fiscal year). "Ces trois échéances sont cumulatives et impératives." **Daily, monthly and annual, all three, unwaivable.**
- Each closure must calculate and record "des données cumulatives et récapitulatives, intègres et inaltérables", "comme le cumul du grand total de la période et le total perpétuel pour la période."
- The definitions: the **grand total** is turnover "depuis l'ouverture de la période comptable en cours"; the **total perpétuel** is turnover "depuis le début de l'utilisation du logiciel ou système de caisse" — a counter "ne se remettant jamais à zéro".
- Counter continuity: replacing the hardware or the software restarts the counters (the old ones must be archived); a **version upgrade must not reset them**.
- "Ces données cumulatives et récapitulatives ne doivent donc jamais être purgées" — and § 260, after a purge of transaction data, the two grand totals must remain "en ligne" in the system itself.

And § 180, the trap that kills any design that stores only the closure: conservation covers all line-level data "et pas seulement sur le Z de caisse". "Un assujetti qui ne conserve que les Z de caisse ne respecte pas les obligations de conservation" — results must be justified by the elementary data, "et non par des données agrégées résultant de traitements automatisés". **The closure must be stored *and* the lines must survive.**

### Germany — DSFinV-K v2.4

The German `Kassenabschluss` is the closest thing to a specified schema for a closure document ([DSFinV-K v2.4](https://kassensichv.com/downloads/DSFinV-K-Vers-2-4.pdf); canonical landing page: [BZSt](https://www.bzst.de/DE/Unternehmen/Aussenpruefungen/DigitaleSchnittstelleFinV/digitaleschnittstellefinv.html)). It is explicitly a **Buchungsbeleg** — an accounting document — and is stored in three files under a common key.

`Stamm_Abschluss` (`cashpointclosing.csv`) — the header: `Z_KASSE_ID` (till id), `Z_ERSTELLUNG` (closure timestamp), **`Z_NR`**, `Z_BUCHUNGSTAG` (a posting day that may differ from the creation date), `TAXONOMIE_VERSION`, **`Z_START_ID` and `Z_ENDE_ID`** (first and last receipt id in the closure), merchant `NAME`/`STRASSE`/`PLZ`/`ORT`/`LAND`/`STNR`/`USTID`, `Z_SE_ZAHLUNGEN` (sum of all payments) and `Z_SE_BARZAHLUNGEN` (sum of all cash payments).

`Z_NR`'s own definition is the rule WCPOS needs: "Der Kassenabschluss wird einmalig bzw. mehrmals am Tag oder auch kalendertagübergreifend für eine Kasse erstellt. Jede Kasse besitzt eine Z_NR, eine Kassenabschlussnummer. Diese ist **aufsteigend, fortlaufend und nicht zurücksetzbar**." One counter **per till**, ascending, gapless, never reset — and a closure may span or subdivide a calendar day.

`Z_GV_Typ` (`businesscases.csv`) — totals per business-case type × VAT key: `GV_TYP`, `GV_NAME`, `AGENTUR_ID`, `UST_SCHLUESSEL`, `Z_UMS_BRUTTO`, `Z_UMS_NETTO`, `Z_UST`. The `GV_TYP` vocabulary is the closure's real content model: `Umsatz`, `Pfand`, `PfandRueckzahlung`, `Rabatt`, `Aufschlag`, `ZuschussEcht`, `ZuschussUnecht`, **`TrinkgeldAG`/`TrinkgeldAN`** (employer/employee tips, separated), single- and multi-purpose voucher sale and redemption, `Forderungsentstehung`/`Forderungsaufloesung` (receivable raised/settled — the on-account case Lightspeed warns about), `Anzahlungseinstellung`/`Anzahlungsaufloesung` (deposits), **`Anfangsbestand`** (opening float), `Privatentnahme`/`Privateinlage`, **`Geldtransit`** (drawer→safe/bank), `Lohnzahlung`, `Einzahlung`, `Auszahlung`, and **`DifferenzSollIst`** — "die Abweichung zwischen einem errechneten und dem gezählten Kassenbestand", which "kann sich sowohl um Fehlbeträge als auch um positive Differenzen handeln".

`Z_Zahlart` (`payment.csv`) — `ZAHLART_TYP`, `ZAHLART_NAME`, `Z_ZAHLART_BETRAG`, per type and per name. The `ZAHLART_TYP` vocabulary is closed: `Bar`, `Unbar`, `Keine`, `ECKarte`, `Kreditkarte`, `ElZahlungsdienstleister`, `Guthabenkarte`.

`Z_Waehrungen` (`cash_per_currency.csv`) — cash held per currency, whose stated purpose is "eine jederzeitige Kassensturzfähigkeit" — the ability to prove the drawer at any moment.

**Two design lessons transfer regardless of country.** First, **the cash variance is a business case with its own type, not a footnote on a report** — `DifferenzSollIst` sits in the same table as sales, tips and float, which means it is posted, not just displayed. Second, **the float, the safe transfer, the private draw and the deposit are all first-class movement types**, so "cash in the drawer" is always reconstructible from typed events rather than from a residue.

---

## 10. Best of everything

### 10.1 The intersection — every system carries these, so adopt them without debate

Ten fields appear in all eight products (and in both fiscal specifications):

1. **Opening float**, entered at open.
2. **Cash movements in and out**, each with an amount, a timestamp, an actor and a **reason or comment**. Nobody stores a bare number.
3. **Expected cash**, computed.
4. **Counted cash**, entered by a person.
5. **The variance** between them.
6. **Totals per payment method.**
7. **Register / device identity** on the closure.
8. **Opened-at and closed-at**, and the closure is explicitly allowed to span or subdivide a calendar day (Square, DSFinV-K and Lightspeed X-Series all say so outright).
9. **Who opened it and who closed it** — as two separate fields, not one "user".
10. **A print at close**, to the receipt printer, from the till.

Two more are near-universal and belong with them: **gross and net sales for the period**, and **refunds separated from sales** rather than netted into them.

### 10.2 The extras worth choosing

Ranked by how much they change the design rather than the display.

**Count every tender, not just cash.** Lightspeed X-Series, R-Series and Odoo all reconcile counted-against-expected **per payment method**, not cash-only. X-Series carries it into the wire format — the close request body is an array of `{payment_type_id, total}` — and R-Series stores one `RegisterCountAmount` row per type with both `calculated` and `actual`. This is the single biggest divergence in the survey: Square, Shopify, Clover, Toast and Loyverse all treat the closure as a **cash** exercise and everything else as a report. The card-counting products are right, because a terminal batch total that disagrees with the POS is exactly the discrepancy a closure exists to catch.

**Make the variance an event, not a line.** Toast writes `CLOSE_OUT_EXACT` / `CLOSE_OUT_OVERAGE` / `CLOSE_OUT_SHORTAGE` as typed rows into the same cash-entry stream as sales and pay-outs; DSFinV-K gives the same concept its own business-case type, `DifferenzSollIst`, in the same table as `Umsatz` and `Rabatt`. A variance that is a computed cell on a screen can silently change; a variance that is a posted row cannot.

**Corrections are new rows, never edits.** Toast's `CashEntry.undoes` holds the GUID of the entry it reverses. Lightspeed X-Series states the doctrine in prose instead: a closure "isn't possible to edit", and a mis-keyed count is fixed by **offsetting it in the next closure**. Same rule, one enforced by schema and one by policy — the schema version is the one to copy, and it happens to be what France requires anyway ("opérations de « plus » et de « moins »").

**Two variances, not one.** Toast separates *cash over/short* (drawer count vs expected, float **included**) from *deposit over/short* (banked vs expected, float **excluded**), and says in its own help that the commonest shortage is a counter forgetting the float. Shopify separates the axis differently and just as usefully: **opening discrepancy** (last session's reported close vs this session's opening count) and **closing discrepancy**. Both splits localise the loss instead of reporting one blended number; between them, opening/closing is the one that matters more for an offline POS, because it catches the overnight gap.

**Blind counting as a permission.** Toast's `3.17 Blind` and Loyverse's **View shift report** both hide the expected figure from the person counting the drawer. It is the only control in the survey that changes whether the counted number means anything.

**A three-state lifecycle.** Square's `OPEN → ENDED → CLOSED` and Toast's `Active → Paused → Closed` are the same idea: the interval can be sealed before the money is counted. Square's definition of ENDED — "ended but has not yet had an employee content audit" — is the cleanest statement of it. This is what makes "close the till now, count it when the manager arrives" representable, and it doubles as the X/Z distinction without needing the letters.

**Sales and payments are two different totals, and say so.** Lightspeed X-Series is alone in documenting this: "Sales" is the value of sales *created* in the window, "Payments" is money *taken* in the window, and an on-account payment against an earlier sale legitimately appears in one and not the other. DSFinV-K encodes the same reality as `Forderungsentstehung` / `Forderungsaufloesung`. Any closure that presents one number and calls it both will be wrong on the first layby.

**Store the breakdowns on the closure.** Loyverse's `Shift` carries `taxes[]` and `payments[]` **as stored arrays on the record**. Odoo and Toast recompute theirs — and both document the consequences: Odoo's `cash_register_difference` is a non-stored compute that re-derives on every read, and Toast's own cookbook warns that undo pairs straddle business dates, that `closeoutHour` moves with DST, and that `CASH_COLLECTED` excludes cash tendered at the check. A closure you recompute is a closure that can change its mind about last March.

**A gapless, non-resettable number per register.** X-Series calls it "Sequence # / Closure #"; DSFinV-K specifies it exactly — `Z_NR`, one counter per till, "aufsteigend, fortlaufend und nicht zurücksetzbar". Note **per till**, not global: a shop with three tills has three sequences, which is also the only arrangement that survives an offline till.

**First and last receipt id in the closure.** DSFinV-K's `Z_START_ID` / `Z_ENDE_ID`. Two columns that make "which sales does this closure claim to cover?" answerable without re-running the aggregation — the cheapest audit link in the whole specification, and the natural place to detect a late-arriving offline sale that landed in an already-closed period.

**Say what the report is and when it was made.** Lightspeed S-Series prints `Report Type` and `Printed` as fields on the slip itself; DSFinV-K stores `Z_ERSTELLUNG` and a separate `Z_BUCHUNGSTAG` for a posting day that differs from the creation date. A reprint must be identifiable as a reprint.

**Bound the reprint.** S-Series allows Z reprints for shifts opened in the past 7 days, configurable down to 2; X-Series prints the slip once and sends you to the back office thereafter. Either is better than an unbounded "print again" that produces a second document indistinguishable from the first.

**Per-device history with a sync marker.** Loyverse's POS shift history "shows only the shifts created on the current POS device" and flags any shift with unsynced events as **Unsynced**. For an offline-first POS this is not a nicety — it is the only honest way for a till to describe what it does and does not know.

**Chain the float.** Odoo sets a new session's `cash_register_balance_start` from the previous session's `cash_register_balance_end_real`; Shopify auto-opens a session using the prior session's calculated ending cash. Free continuity, and it is what makes Shopify's opening discrepancy computable at all.

**What nobody has, and France requires**: a **period grand total** and a **perpetual grand total that never resets**. Zero of the eight commercial products carry either. That is the one section WCPOS would have to invent rather than copy — and BOFiP § 170 is explicit that a version upgrade must not reset the counters, which makes it a data-migration constraint, not just a field.

**What nobody should copy**: Clover's three unconnected closes (employee shift, cash log, card batch) with no object tying them together and no REST resource for the one that is irreversible; and Toast's Z Report, which despite the name closes nothing — the day turns over on a 4 a.m. clock whether or not anyone ran it, and unclosed checks are auto-captured with a $0 tip. Lightspeed L-Series shows the alternative in one line: its **Closing Report (Z)** "views and resets totals" and **locks finalized receipts from editing**. A Z is a state transition on the sales it covers, not a printout.

### 10.3 How the best products split the till page from the reports page

The products that get this right — Lightspeed X-Series, Loyverse, Shopify, Square — all land on the same three-way division, and the seam is **who can physically touch the drawer**.

**The till page owns the drawer and this device.** Open with a float; add and remove cash with a reason; view the running totals without closing (Lightspeed's spot check, Loyverse's X-report, Shopify's "View open session"); close with a count; print once. Plus a **history list scoped to this device only** — Loyverse and Shopify both say this explicitly, and Shopify adds that sessions "are stored on the device that created them and aren't visible elsewhere". Nothing on this page is a query. There are no date ranges, no filters, no other registers.

**The reports page owns every register and all of history.** Lightspeed's **Reporting → Register Closures** is the model: a list across outlets, a date picker, CSV export, and **View full details** that opens a past closure showing every sale, its products and its payments *as recorded for that closure*. Square's Dashboard `Reports > Payments > Cash drawers`, Shopify's admin **Cash tracking**, and Loyverse's **Reports → Shifts** are the same page under different names. Filters, exports and cross-register roll-up live here and nowhere else.

**Three rules make the split hold.**

- **Opening is physical; closing is supervisory.** Square and Shopify both let a drawer be **closed** from the back office but never **opened** from it. Square adds the honest caveat that a remote close forfeits the ability to pay in or out to adjust.
- **Closing your own register is a default right; browsing other people's closures is the gated one.** Lightspeed X-Series makes open, close and cash movement permissions that "cannot be removed" from any role, and gates only "View register closures and cash movement reports". Loyverse gates the *expected* figure at the till with the same right that gates history. The cashier acts; the manager reads.
- **The till page is not a reporting tool, and the product should say so.** Shopify's warning is the sentence to steal: "Register sessions aren't for long term reporting… the Expected cash and Discrepancies reports might become inaccurate" — use the finance reports instead. A till page that quietly answers period questions will be trusted for them and will be wrong.

Two things belong on **both** pages, rendered from the same stored record: the closure summary itself (thermal at the till, HTML/PDF in the back office) and the variance. Everything else — product mix, category sales, tax detail, staff performance — belongs only to the reports page. Odoo is the counter-example worth noting: the same generator builds the one-session report and an arbitrary date-range report, which is elegant and is also why an Odoo closure reprinted next year can differ from the one printed on the night.

---

## 11. Against WCPOS

WCPOS today has the display layer of a Z-report and none of the record. `packages/core/src/screens/main/reports/report/template.tsx` renders store name and id, a *report generated* timestamp, a period start and end, the current cashier, then Sales Summary (order count, net sales, tax, total, refunds, discounts), Payment Methods, Taxes, Shipping, a cashier×store table when more than one combination appears, and Items Sold / Average Order Value — all computed in `calculateTotals()` from whichever completed orders the filter bar has selected, on the client, on every render. Measured against §10.1 it is missing every cash field — float, pay in/pay out, expected, counted, variance — because there is no till object to hold them; it has no register identity (the groundwork's G1), no closed-at, no closed-by, no number, and its period is a filter rather than a bounded interval with a first and last receipt. Measured against §10.2 the gap is sharper: nothing is stored, so nothing is immutable, and a report reprinted after a late offline sync will differ from the one printed on the night — which is the failure BOFiP § 180 and DSFinV-K's `Z_START_ID`/`Z_ENDE_ID` both exist to prevent. The good news is that the shape [#199](https://github.com/wcpos/roadmap/issues/199) proposes is exactly the surveyed consensus, and the two pages [#77](https://github.com/wcpos/roadmap/issues/77) is already designing map cleanly onto §10.3: a till page that opens, counts, moves cash and closes for *this* device with an Unsynced marker, and a reports page that browses every register's stored closures with filters and exports. The one section WCPOS must invent rather than copy is the perpetual grand total — no commercial product surveyed has one, and BOFiP § 170 requires that it survive a version upgrade, which makes it a migration constraint to settle before the first closure is ever written, not a field to add later.

---

## 12. Could not source

Square's full `CashDrawerEventType` enum beyond the five values visible in its own examples, and the exact granular Team Permissions toggle labels. Whether a Shopify register session carries any merchant-visible sequential number. Whether the Lightspeed X-Series closure summary carries a closed-by employee, a transaction count, or a gross/net line (none appears in the documented field list; R-Series has `closeEmployeeID`, X-Series appears not to). Whether X-Series exposes a closure as a REST resource (only the `register_closure.create` webhook and the internal `register_open_sequence_id` are documented). Clover's counted-cash / over-short flow in the core Cash Log app, whether a standalone Refunds report exists, and the Taxes report's field list — several `clover.com/help` pages are JS-rendered and returned empty. Toast's export file formats for the Cash Activity Audit, and whether a completed Close Out Day can itself be reopened. Whether a closed Loyverse shift can be reopened or amended, and the column list of its Shift summary and Pay ins/payouts exports. Odoo's `amount_authorized_diff` maximum-difference setting is in the source but is not described in the 18.0 user documentation.

---

## Sources

**Square** — [CashDrawerShift](https://developer.squareup.com/reference/square/objects/CashDrawerShift) · [CashDrawerShiftSummary](https://developer.squareup.com/reference/square/objects/CashDrawerShiftSummary) · [CashDrawerShiftEvent](https://developer.squareup.com/reference/square/objects/CashDrawerShiftEvent) · [CashDrawerShiftState](https://developer.squareup.com/reference/square/enums/CashDrawerShiftState) · [Cash Drawer Shifts API guide](https://developer.squareup.com/docs/cashdrawershift-api/reporting) · [Reporting API](https://developer.squareup.com/docs/reporting-api) · [Labor API overview](https://developer.squareup.com/docs/labor-api/what-it-does) · [Start and end a cash drawer session](https://squareup.com/help/us/en/article/8344-start-and-end-a-cash-drawer-session) · [View cash drawer reports](https://squareup.com/help/us/en/article/8358-view-cash-drawer-reports) · [Close of day report](https://squareup.com/help/us/en/article/6594-end-of-day-reporting-with-square-for-restaurants) · [Run a restaurant shift report](https://squareup.com/help/us/en/article/8140-run-shift-report-with-square-for-restaurants) · [Print, export, or email your reports](https://squareup.com/help/us/en/article/8362-print-export-or-email-your-reports)

**Shopify POS** — [CashTrackingSession](https://shopify.dev/docs/api/admin-graphql/latest/objects/cashtrackingsession) · [CashTrackingAdjustment](https://shopify.dev/docs/api/admin-graphql/latest/objects/CashTrackingAdjustment) · [PointOfSaleDevicePaymentSession](https://shopify.dev/docs/api/admin-graphql/latest/objects/PointOfSaleDevicePaymentSession) · [CashDrawer](https://shopify.dev/docs/api/admin-graphql/latest/objects/CashDrawer) · [CashActivity](https://shopify.dev/docs/api/admin-graphql/latest/interfaces/CashActivity) · [New retail cash management capabilities](https://shopify.dev/changelog/new-retail-cash-management-capabilities) · [Managing register sessions from Shopify POS](https://help.shopify.com/en/manual/sell-in-person/shopify-pos/cash-register-management/register-sessions-in-shopify-pos) · [Managing register sessions from the Shopify admin](https://help.shopify.com/en/manual/sell-in-person/shopify-pos/cash-register-management/register-sessions-in-shopify-admin) · [Cash tracking reports by location](https://help.shopify.com/en/manual/sell-in-person/shopify-pos/cash-register-management/cash-tracking-reports-by-location)

**Lightspeed** — [Opening and closing a register (X-Series)](https://x-series-support.lightspeedhq.com/hc/en-us/articles/25534185400347-Opening-and-closing-a-register) · [Using the register closure report](https://x-series-support.lightspeedhq.com/hc/en-us/articles/25534252854043-Using-the-register-closure-report) · [Can I reopen or edit a register closure?](https://x-series-support.lightspeedhq.com/hc/en-us/articles/25534022428315-Can-I-reopen-or-edit-a-register-closure) · [Sales and payments discrepancies in register closures](https://x-series-support.lightspeedhq.com/hc/en-us/articles/25534288564251-Understanding-sales-and-payments-discrepancies-in-register-closures) · [Spot checks without closing](https://x-series-support.lightspeedhq.com/hc/en-us/articles/25533881673499-How-to-perform-spot-checks-on-your-cash-without-closing-the-register) · [Setting user roles and permissions](https://x-series-support.lightspeedhq.com/hc/en-us/articles/25534171377819-Setting-user-roles-and-permissions) · [Close register (X-Series API)](https://x-series-api.lightspeedhq.com/reference/closeregister) · [Closing (X-Series API guide)](https://x-series-api.lightspeedhq.com/docs/registers_closing) · [Webhooks](https://x-series-api.lightspeedhq.com/v2026.01/docs/webhooks) · [RegisterCount (R-Series)](https://developers.lightspeedhq.com/retail/endpoints/RegisterCount/) · [Register open (R-Series)](https://developers.lightspeedhq.com/retail/endpoints/Register-open/) · [X and Z Reports (S-Series)](https://shopkeep-support.lightspeedhq.com/support/reporting/z-and-x-reports) · [Global X/Z closing reports (L-Series)](https://resto-support.lightspeedhq.com/hc/en-us/articles/360007460293-Enabling-and-viewing-global-X-Z-Closing-reports)

**Clover** — [Get all cash events](https://docs.clover.com/dev/reference/cashgetallcashevents) · [Get all shifts for an employee](https://docs.clover.com/dev/reference/employeegetemployeeshifts) · [Closeout (Android Payments API)](https://docs.clover.com/dev/docs/android-payments-api-closeout) · [Closeout (Clover Go SDK)](https://docs.clover.com/dev/docs/closeout) · [Run a cash log report](https://www.clover.com/en-US/help/run-cash-log-report) · [Closeout app](https://www.clover.com/help/closeout-app-close-out-current-batch) · [Manual closeout method](https://www.clover.com/en-GB/help/manual-closeout-method) · [Save, print, or email your closeout report](https://www.clover.com/en-US/help/get-closeout-report) · [Sales Overview / Cash Log (EU)](https://www.eu.clover.com/en-gb/help/cash-log-app/)

**Toast** — [Close Out Day, Z Report, and Auto-Capture](https://support.toasttab.com/en/article/Close-Out-Day-Z-Report-Auto-Capture) · [Shift Review Overview](https://support.toasttab.com/en/article/Shift-Review-Overview) · [Customize Shift Review Settings](https://support.toasttab.com/en/article/Customizing-Shift-Review-Settings) · [Use Cash Drawers (New Experience)](https://support.toasttab.com/en/article/Use-Cash-Drawers-New-Experience) · [Cash Drawer Reports Overview](https://support.toasttab.com/en/article/Cash-Drawer-Reports-Overview) · [Get Started With Cash Deposits](https://support.toasttab.com/en/article/Deposits-Adding-Actual-Cash-Amounts) · [Getting cash entries](https://doc.toasttab.com/doc/devguide/apiUsingCashManagementApi.html) · [Building a cash transactions report](https://doc.toasttab.com/doc/cookbook/apiHowToCashReports.html)

**Loyverse** — [API reference spec (`API-Reference__v1.0.yaml`)](https://developer.loyverse.com/docs/API-Reference__v1.0.yaml), served by [developer.loyverse.com/docs](https://developer.loyverse.com/docs/) · [Shift Management in Loyverse POS](https://help.loyverse.com/help/shift-management-loyverse-pos) · [Shift Report with Sales Summary at the POS](https://help.loyverse.com/help/shift-report-sales-summary-pos) · [How to Work with Shift History in the POS](https://help.loyverse.com/help/how-work-shift-history-pos) · [How to Manage Access Rights of Employees](https://help.loyverse.com/help/how-manage-access-rights-employees)

**Odoo POS** (source read on branch `18.0`) — [`models/pos_session.py`](https://github.com/odoo/odoo/blob/18.0/addons/point_of_sale/models/pos_session.py) · [`models/report_sale_details.py`](https://github.com/odoo/odoo/blob/18.0/addons/point_of_sale/models/report_sale_details.py) · [`wizard/pos_daily_sales_reports.py`](https://github.com/odoo/odoo/blob/18.0/addons/point_of_sale/wizard/pos_daily_sales_reports.py) · [`wizard/pos_details.py`](https://github.com/odoo/odoo/blob/18.0/addons/point_of_sale/wizard/pos_details.py) · [Point of Sale — Odoo 18.0 documentation](https://www.odoo.com/documentation/18.0/applications/sales/point_of_sale.html)

**Fiscal** — [BOI-TVA-DECLA-30-10-30, version of 25/03/2026](https://bofip.impots.gouv.fr/bofip/10691-PGP.html/identifiant=BOI-TVA-DECLA-30-10-30-20260325) (§§ 155, 170, 180, 250, 260) · [DSFinV-K v2.4 (specification PDF)](https://kassensichv.com/downloads/DSFinV-K-Vers-2-4.pdf) · [BZSt — Digitale Schnittstelle der Finanzverwaltung für Kassensysteme](https://www.bzst.de/DE/Unternehmen/Aussenpruefungen/DigitaleSchnittstelleFinV/digitaleschnittstellefinv.html)

**WCPOS** — [`packages/core/src/screens/main/reports/report/template.tsx`](https://github.com/wcpos/monorepo/blob/main/packages/core/src/screens/main/reports/report/template.tsx) · [`report/utils.ts`](https://github.com/wcpos/monorepo/blob/main/packages/core/src/screens/main/reports/report/utils.ts) · [fiscal compliance groundwork research](https://github.com/wcpos/roadmap/blob/research/fiscal-compliance-groundwork/docs/research/2026-09-11-fiscal-compliance-groundwork.md)
