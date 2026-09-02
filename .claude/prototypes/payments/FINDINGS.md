# Findings — six payment scenarios against the decided schema (wayfinder #110)

Types encode the resolutions on #102/#103/#104/#107 (`types.ts`); the scenarios are in
`fixtures.ts`. `tsc --strict` passes and `tsx fixtures.ts` derives the expected balance,
change, status and `payment_method` for all six. Verdict: **the two-axis descriptor and the
N-rows-on-one-order ledger hold up for the money flows**; the defects are at the edges —
the route family, the webview passthrough, per-transport capabilities, and what a row must
remember. Nothing below needed a parent/sub-order or a sentinel gateway.

## Schema defects (a scenario could not be expressed without a special case or an extra field)

1. **The route family has no refund route (S6).** #103.5 says "the POS drives each provider
   leg through its driver and records the outcome on the row", but a Stripe refund is
   server-side only (`POST /v1/refunds`, #99.6) — the driver cannot do it, and
   `bootstrap/intent/capture/status/void` has nowhere for it. Either add
   `POST …/payments/{uuid}/refund` to the family, or rule that allocations are executed by
   the server when the `shop_order_refund` is created (then the app never "drives" it).
   Interac refunds, which are mandatorily on-device, need the route in *both* directions.

2. **`bootstrap` is keyed on a payment UUID but the connection token is not per-payment (S2,
   S3).** The Stripe SDK asks for a token at reader connect, on reconnect, and while
   forwarding offline payments (#99.1) — before any payment row exists. As decided,
   `POST orders/{id}/payments/{uuid}/bootstrap` cannot be called until a leg is started. The
   fixture fakes it by minting the row first. Needs a per-method (not per-payment) bootstrap.

3. **Webview cannot be a split leg (S5).** The order-pay page charges `$order->get_total()`;
   there is no way to hand a legacy gateway a *balance*. So `amount.partial` is forced
   `false` and, worse, a webview leg after a cash leg would over-charge. The cashier rules
   (#107.1 "no cap on legs") silently exclude every `webview` method. Rule it: webview is
   single-tender only, and the legacy tab is disabled once the ledger has a live leg.

4. **Webview breaks the client-minted-UUID rule (S5).** The gateway calls
   `payment_complete()` and the *server* learns of the payment first. Either the app mints a
   `pending` row before opening the page (then the passthrough must find it — by what key,
   since the gateway never sees it?) or the passthrough mints the id server-side. The fixture
   uses a server-minted id and marks it. Also: what `amount`/`refs` does the passthrough
   write — order total and `_transaction_id` is the best guess, not a decision.

5. **Capabilities are per method, but `device` capabilities vary per transport (S2 vs S3).**
   One `stripe_terminal` descriptor declares `transports: [bluetooth, tap_to_pay]` and one
   `offline: queue` — true for the Bluetooth reader, false for Tap to Pay on Android, preview
   on iPhone (#99.8); tipping likewise differs. Either `capabilities` moves under each
   transport (`hardware.transports: [{ transport, offline, tips }]`) or Tap to Pay is its own
   gateway (then "one report bucket" needs `kind` — fine — but Woo shows two gateways).
   Otherwise Tap to Pay and a Bluetooth reader are **identical in the schema**; the only
   trace of which was used is an ad-hoc `refs.transport` in the opaque bag.

6. **The row does not carry its capture mode, but the server dispatches by it.** Handlers are
   registered per mode and every route is keyed on the row UUID (#104). If the merchant
   changes a gateway's mode between an offline record and its replay (or between intent and
   capture), dispatch changes under the row. `Payment.capture_mode` is added as EXTRA in every
   scenario. Same for `recorded_offline`: with every id client-minted (#103.2), nothing marks
   an offline row any more, yet reconciliation (S3's forwarded intent) and reports need it.

7. **Retry of a failed leg contradicts the lifecycle (S2).** #103.6 "a retry re-runs only
   failed legs" implies `failed → pending` on the same UUID; #103.5's lifecycle is
   `pending → authorized → captured | failed | voided` with no way back. The fixture
   creates a second row (`b1` failed, `b2` captured). Rule which: re-run in place (idempotent
   but rewrites history) or new row (audit-clean; "failed legs" in the retry means "legs
   whose latest row failed").

## Ambiguities (expressible, but the schema lets two readings through)

- **Largest tender = a gift card (S4).** `payment_method` becomes `pos_gift_card`, so Woo
  Analytics attributes the whole $92.95 to the gift card gateway and wp-admin's refund
  gateway is the gift card. Consider "largest tender excluding `stored_value`", and decide
  tie-breaks (a 50/50 split has no largest).
- **Whose `defaults.order_status` wins in a split (S4, S6)?** `derive()` takes the largest
  tender's; S4 lands on `completed` (gift card) though the card leg says `processing`. Not
  written anywhere.
- **`tendered` on a non-cash row.** The row has no `kind`; nothing stops `tendered` on a
  card leg. Change is computed from `tendered − amount` over whatever rows carry it. Either
  the row snapshots `kind` (also protects reports when a gateway is deleted) or `tendered`
  is validated against the descriptor at write time.
- **Do `authorized` legs reduce the balance?** #107.1 says captured legs do; the device
  commits the money before server capture (#99.3) and the cashier sees the reader say
  "Approved". `derive()` counts `authorized`; the cashier rule should say so.
- **Refund allocation to a voided/failed leg (S6).** Nothing in `RefundAllocation` prevents
  `payment_id: 'f0'` (voided). Invariant needed: allocations target `captured` rows only and
  `Σ allocations ≤ amount − refunded_amount`. `defaultAllocation()` enforces it; the meta does not.
- **Where the refund outcome lives.** "Recorded on the row" — the allocation gained
  `status`/`provider_ref` as EXTRA. Alternative: a `refunds[]` list on the payment row. Pick one.
- **Who settles an offline `device` row (S3).** The forwarded intent id arrives on the app
  (`onDidForwardPaymentIntent`) and at Stripe (webhook). The record route is the only
  writer today; a webhook writer matching `metadata.wcpos_payment_id` is not in the family.
- **`webview_available: true` on a webview-mode method is tautological (S5)**; it is only
  meaningful on `device`/`server` methods. Fine, but document it.
- **On-reader tips (S2).** After confirmation the PI amount includes the tip (#99.9), so a
  device row's `amount` can exceed the leg's share of the total and the ledger no longer
  "sums to the total". Out of scope (tips ticket) but the derivation depends on it.
- **"Record a void row" (#107.6)** — the fixture sets `status: voided` on the existing row;
  the wording could also mean appending a separate row.
- **Money wire form** (decimal string vs minor units) and `provider` for `server` mode are
  unstated. Gift cards: a Woo gift-card plugin that models redemption as an order-total
  reduction would double-count against a `stored_value` row; `pos_gift_card` here assumes
  Pro's own stored-value store.

## What expressed cleanly

| Scenario | Clean? | Notes |
|---|---|---|
| 1 Offline cash with change | yes | `amount`/`tendered` pair, single cash sale is the degenerate case, idempotent replay on the UUID |
| 2 Bluetooth reader (`device`) | mostly | `pending → authorized → captured` fits manual capture; retry (#7) and bootstrap (#2) are the gaps |
| 3 Tap to Pay (`device`) | mostly | `refs: { payment_intent: null }` + client UUID reconciles offline; indistinguishable from S2 (#5) |
| 4 Gift card + card | yes | stored-value-first, balance-capped leg, `_wcpos_payment_method` matches both legs; `payment_method` choice questionable |
| 5 Legacy webview | no | single-tender only (#3), server-minted id (#4) |
| 6 Provider refund of one split tender | mostly | allocation + `refunded_amount` rollup + lifecycle-only status work; the refund route is missing (#1) |

Derived `pos-open → pos-partial → default status`, the composed title, the index meta and
`change` all fell out of `derive()` with no per-mode branches — the strongest sign the
ledger shape is right.
