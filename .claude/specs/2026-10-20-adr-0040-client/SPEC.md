# Spec: ADR 0040 on the client — protocol 3, money commands, the offline tender outbox

**Date:** 2026-10-20 (revised after two Codex reviews and Paul's legacy-queue ruling, §6) · **Lane:** `next` · **Decision:** ADR 0040 (server derives paid from its payment rows; no money epoch) · **Server:** wcpos/woocommerce-pos `next` PRs 1–4 merged (#2349, #2352, #2355, #2362), deployed to dev-next; PR 5 (`contract: '1.3'`) pending · **Settled, not re-asked:** D1–D6 of the server handoff · **Stakes:** High (checkout money) · **Ground truth:** client read at `c0d06af60` (`origin/next`); server read from `next` on 2026-10-20 (`includes/…` paths are the free plugin unless marked Pro).

Shape: ground truth → rules (change, where, failure story, pins) → signatures → PR sequence → decisions → open questions → review log. Every pin is a jest test that fails against today's code; a test that already passes is marked **control**.

## 0. Ground truth

### 0.1 What the server now does to this client

| Surface | Behaviour | Server source |
|---|---|---|
| Gate | Protocol below 3 → 426 `wcpos_update_required` on every gated `wcpos/v2` route, push and money routes included | `Services/Protocol_Gate.php:15-16` |
| Push envelope | Any key outside `mutationId, operation, collection, recordId, baseRevision, payload, force` → 400 `woo_rxdb_sync_bad_envelope` | `API/V2/Write_Controller.php:334-337` |
| Push ack | `{ document, currentRevision }` (a `sha256:` revision) on every 2xx | `Write_Controller.php:772-786` |
| Push status | Normalises `wc-`; outside `pos-open, pending, on-hold, cancelled` → 422 `wcpos_status_not_pushable` (the whole push), except the order's own non-pushable status echoed by a full document, which is dropped. A pushable status that differs from a paid order's is a **reopen** | `API/V2/Writers/Order_Writer.php:39, 904-927` |
| Push money | Drops `set_paid, date_paid, date_paid_gmt, transaction_id, payment_method, payment_method_title` and meta `_wcpos_payments, _wcpos_payment_method, _wcpos_payment_id, _wcpos_payment_live, _wcpos_commands, _wcpos_completed_at, _wcpos_completions, _wcpos_fiscal_pending, _wcpos_gateway_attempts, _wcpos_awaiting_customer, _payment_method, _payment_method_title, _transaction_id, _date_paid, _paid_date` (by key and by meta id) | `Services/Pos_Order_Audit.php:44-67`, `Order_Writer.php:930-935` |
| Push refusals | 422 `reopen_required`, `wcpos_money_in_motion`, `wcpos_currency_locked`; 409 `woo_rxdb_sync_record_locked` (retryable) | server SPEC §2 |
| Order lock | Every money route takes the order lock **before** replay lookup; a held lock answers 409 `wcpos_payment_locked` without running anything, so it says nothing about an earlier attempt | `adr0040/Payments_Controller.php:93-101`; `Payments/Contract/Order_Lock.php:132-145` |
| Money routes | `orders/{id}/payments` (record), `…/payments/{uuid}/{intent,capture,void,refund}`, `…/payment-methods/{method}/{submit,cancel}`, `orders/{id}/close`; `GET …/{uuid}/status` is a poll (no envelope, no `revision` back) | `adr0040/Payments_Controller.php:70-82` |
| Envelope | `revision` on all eight (428 `wcpos_revision_required`); `command_id` (uuid) on all but `record` (400 `rest_invalid_param`); `record`'s id is `payment.id`, its fingerprint the whole body | `Payments_Controller.php:386-415` |
| Fingerprint | `kind + target + body` minus `command_id` and `revision`; keys canonicalised, values as sent | `Payments/Contract/Command_Log.php:39-49` |
| Replay | Checked **before** the revision: same id + fingerprint replays (record, intent, submit called through); same id + other fingerprint → 422 `wcpos_command_conflict`, which for `record` carries the stored row in `data.payment`; a row with no command entry of its own (minted before PR 3) answers any reuse of its id with that 422 | `Payments_Controller.php:416-439`; server SPEC §5.6 #32 |
| Stale | A fresh command on another revision → 409 `wcpos_revision_stale`, `data: { currentRevision, current (bare wc/v3 doc), order (summary) }`, nothing written. A **new** row id is always a fresh command | `Payments_Controller.php:488-508` |
| Answer | Every 2xx command answer carries top-level `revision`, never a document | `Payments_Controller.php:517-549` |
| Ledger | `COUNTING_STATUSES = ['captured']`; summary = `status, total, paid, authorized, balance, refund_due, refund_pending, payment_method, payment_method_title` | `Payments/Contract/Ledger.php:53, 582-604` |
| `record` | Manual methods and device methods with `capabilities.offline` ∈ {`record`,`queue`}; status `captured` or `authorized`; keeps `provider_refs`, `recorded_offline`; a new row on an open order is checked only against the balance, so a second row for the same cash is accepted while balance remains; a closed sale stores a refused row and answers 409 `wcpos_order_already_paid` | `Ledger.php:617-735, 2462-2476` |
| `close` | `{ command_id, revision, provenance? }`; completes a covered open order; 409 `wcpos_balance_outstanding` when **total ≤ 0** or signed balance > 0; 409 `wcpos_payment_in_flight` while money moves | `Ledger.php:1745-1764` |
| Provenance | `record, intent, capture, submit, close` may carry `provenance: { register_id, session_id, sale_time, sale_tz, sale_counter }`; the stamp prefers it to the write-once till tuple, which covers completion 1 only | server SPEC §4.4 |

### 0.2 What the client does today

| Area | Today | Where |
|---|---|---|
| Protocol | `SYNC_PROTOCOL_VERSION = 2` → every gated request 426s | `packages/utils/src/sync-protocol.ts:7` |
| Wire strip | Only the aggregate (`total`, `tax_lines`, …); status, `payment_method*`, `transaction_id`, every meta key ride | `sync-core/src/woo/orderWriteContract.ts:49-81` via `sync-engine/src/materialization/sanitize-outbound-order-payload.ts:35-39` |
| Seams | Enqueue and coalesce sanitize | `sync-engine/src/write-path/write-intents.ts:123-132, 166-171, 276-282, 741-750` |
| Status echoes | Coalesce re-layers the whole resident (`write-placement.ts:80-91`); `pushDocument` sends the whole resident (`query/src/mutations/push-record.ts:47-58`); the cart form saves an unchanged status with a note (`pos/cart/buttons/edit-order-meta/form.tsx:126-135`); dead-letter recovery layers the resident under the recovered fields (`write-intents.ts:967-985`); born-twice recovery re-sends the create snapshot, status included, as an update (`write-intents.ts:1243-1304`) | — |
| Queue gate | `orderChangesAssertIntent` reads top-level keys only | `orderWriteContract.ts:91-95`; `query/src/mutations/resident.ts:112-117`, `local-patch.ts:158` |
| Offline cash | Ledger row + `derive()` status queued via `localPatch`; the 5xx fallback and `queued-offline` orders too | `pos/checkout/payments/record-manual-payment.ts:156-167, 233-236`; `checkout/tender/use-tender-flow.ts:250-251` |
| Online cash | `POST orders/{id}/payments` `{ payment }`; the row is minted per call (`record-manual-payment.ts:137-150`); the mirror rebuilds `meta_data` from the pre-command snapshot | `record-manual-payment.ts:153-154, 185, 241-253`; `use-record-manual-payment.ts:72-79`; `query/src/mutations/mirror-server-order.ts:14-20` |
| Other commands | `server/server-leg.ts:216-235`; `device/device-leg.ts:236-258, 310`; `services/terminal-payments/service.ts:218`; `submit-gateway-payment.ts:94, 196`; `void-payments.ts:99` — no `command_id`, no `revision` | — |
| Offline device | Authorization queued into `_wcpos_payments` (`device-leg.ts:188-222` → `server/use-terminal-payments-service.ts:114-146`); `patchAndEnqueue` again when settlement refs arrive (`service.ts:199-205`); capture by route (`:218`) | — |
| Terminal finish | `saleComplete` needs a zero balance (`service.ts:340-350`, `checkout/sale-completion.ts:272-273`); receipt entry needs a settled order status (`use-terminal-payments-service.ts:52-58`) | — |
| Zero balance | `status: 'completed'` queued | `pos/commands/zero-balance-completion.ts:48-61`; `use-tender-flow.ts:778-787`; `boundary-commit.ts:103-113` |
| Offline void | Live rows voided locally, `pos-open` queued | `void-payments.ts:79-90` |
| Counting | `authorized` + `captured`; balance clamps, ignores refunds; boundary sums both | `order-math/src/payments/derive.ts:10, 84`; `pos/commands/paid-balance-boundary.ts:13-22` |
| Revision | `sync.revision`; re-stamped at claim; orders re-anchor once on 409 | `query/src/records/engine-record.ts:76-82`; `sync-core/src/drainMutationQueue.ts:25-31, 41-45`; `write-drain-lane.ts:517-523, 554-567` |
| Pull under a stamp | Equal `sha256:` stamps → payload not compared; re-anchoring without the document "blinds all three staleness-detection tiers" (#1231) | `sync-engine/src/write-path/local-work-guard.ts:93-115`; `collections/collection-descriptors.ts:480-486` |
| Ack bookkeeping | Every ack writes `currentRevision` (`collection-descriptors.ts:393-400`); adoption only when no successor is queued (`:364`); the order graft adopts listed server-owned meta even with successors (`:669-680`) | — |
| Pull protection | Pending/claimed rows protect the resident; **rejected rows do not** | `sync-core/src/recordMutationQueue.ts:1198-1213` |
| Open-cart hold | Non-explicit order rows on a `pos-open` order are held; only explicit rows and deletes release the chain; a settled snapshot discards an all-held chain | `write-path/open-cart-hold.ts:51-56, 71-80`; `drainMutationQueue.ts:709-717, 747-748`; `write-path/order-pull-guard.ts:155-180` |
| Retry | A failed push goes back to `pending` with `attempts + 1`; `removePending` checks status only | `drainMutationQueue.ts:571-580`; `recordMutationQueue.ts:405-418` |
| Previous generation | Pre-GA a schema edit moves `SCOPE_DATABASE_GENERATION` (today 6); the one previous generation is opened with the schemas it shipped and its unsent rows are pushed through today's write path, its open carts carried over; older generations become unreachable | `sync-core/src/storeScopeIdentity.ts:55-66, 184-190`; `collections/drainable-generation.ts:1-17, 47-66, 85-101`; `write-path/legacy-scope-drain.ts:1-36` |
| Persistent blocking | Conflicted/needs-revision rows block their record across drains; a **rejected** row blocks successors only within the drain that rejected it | `drainMutationQueue.ts:518-529, 625-706`; `recordMutationQueue.ts:1166-1177` |
| Naked revision writers | The 428 `refreshRevision` seam and the manual rebase stamp `sync.revision` without the document | `write-drain-lane.ts:568-601`; `write-path/conflict-resolution.ts:364-385` |
| Reset | `resetForResync` removes every resident without pending local work | `write-path/engine-order-repository.ts:563-580, 652-658` |
| Meta merges | Mutation merges use `PROTECTED_ORDER_META_KEYS` and let a mutation's value win; server adoption keeps the resident's identity keys | `write-path/merge-protected-order-meta.ts:9-14, 22-62`; `query/src/mutations/protected-order-meta.ts:5-13` |
| Epoch-era 1.3 gate | At contract ≥ 1.3: `expectedEpoch`/`tillAggregate` on the envelope; `serverOwnsMoney` ignores the hint; hint writer stands down; latch keyed on `_wcpos_money_epoch` | `write-drain-lane.ts:626-633` → `recordPushAdapter.ts:130-131, 195-196`; `order-math/src/payments/money-owner.ts:13-14`; `pos/commands/money-owner-hint-writer.ts:24-27`; `pos/contexts/order-money-divergence/index.tsx:193-199` |
| Refunds | Pro intake; a new idempotency key **per call** | `orders/refund/use-refund-mutation.ts:50-55, 117-121` |
| 426 UX | Engine/REST latch → `UpdateRequired` (SYNC341); discovery reports AUTH_UNEXPECTED | `screens/auth/hooks/use-api-discovery.ts:162-172` |
| E2E | `'2'` hard-coded | `apps/main/e2e/protocol-signal.spec.ts:92, 99`; `probe-credential.ts:50`; `update-required.spec.ts:20` |

### 0.3 Corrections to the design direction

| Direction said | Code says | Effect |
|---|---|---|
| Write the answer's `revision` to `sync.revision` | The stale payload then sits under a stamp the pull treats as unchanged (`local-work-guard.ts:107-109`) | §1.3: revisions chain in memory; document and stamp are adopted together or not at all |
| Settle `revision: ''` for wc/v3-born orders | Orders are born through `/push/orders`, whose ack carries `currentRevision` (`Write_Controller.php:772-786`, `recordPushAdapter.ts:380-433`); `query/src/mutations/order-birth.ts:18-21` is stale | §1.3 step 4 refreshes once; comment fixed in PR A |
| `api_refund: true` double-refunds | Pro forwards its plan's value, false for ledger plans (Pro `Payments/Refund_Processor.php:231-241, 462`; `RefundPlan.php:106-118`) | §1.7: real defect is the per-call key |
| Seven call sites | Six route families plus `close`; refund is Pro's intake | §1.3 |
| (absent) | 1.3 envelope fields are a 400 at server PR 5 (`Write_Controller.php:334-337`) | §1.6 in PR A |
| (absent) | Provenance for completion n+1 rides the command | §1.3 step 2 |
| (absent) | A 100 %-discount sale has no completion route | §5 |
| (absent) | Pre-upgrade queued rows hold offline tenders and copied statuses that protocol 3 would erase or replay | §1.5: parked, never sent (Paul's ruling, §4.5) |

## 1. Rules

### 1.1 Protocol 3; 426 at login (PR A)

**Change.** `SYNC_PROTOCOL_VERSION = 3` (`sync-protocol.ts:7`), commented with D1. Detection keeps keying on the body code (`:108-130`). `handleApiError` gains a branch before the generic one (`use-api-discovery.ts:162`): `parseUpdateRequiredBody(get(error, ['response','data']))` non-null → `discoveryLogger.error(t('auth.update_required'), { code: ERROR_CODES.APP_UPDATE_REQUIRED, showToast: true, context })`, throw `ApiDiscoveryError`. New key `auth.update_required`: "This store needs a newer version of WCPOS." The E2E files assert `String(SYNC_PROTOCOL_VERSION)`; the mocked refusal says `min_protocol: 3, server_protocol: 3`.

**Failure story.** A future floor above 3 shows SYNC341 at login, never "bad API response".

**Pins.** `utils/src/sync-protocol.test.ts`: `claims protocol 3 on the header and the query twin`. `core/src/screens/auth/hooks/use-api-discovery.test.tsx`: `a wcpos_update_required body during discovery reports SYNC341 with the update message, not AUTH_UNEXPECTED`. E2E `protocol-signal.spec.ts`, `update-required.spec.ts` on dev-next.

### 1.2 Wire discipline: one strip, two seams; status is an intent (PR A)

**Constants and strip** in `sync-core/src/woo/orderWriteContract.ts`:
- `SERVER_OWNED_ORDER_FIELDS` and `SERVER_OWNED_ORDER_META_KEYS` (0.1's lists, commented "mirrors `Pos_Order_Audit::SERVER_MONEY_FIELDS` / `SERVER_MONEY_META_KEYS`; a new key joins both in one change"); `CLIENT_LOCAL_ORDER_META_KEYS = ['_wcpos_unresolved_command']` (§1.3, never sent). `order-math/src/payments/ledger.test.ts` pins `LEDGER_META_KEY` and `PAYMENT_METHOD_INDEX_META_KEY` into the list.
- `PUSHABLE_ORDER_STATUSES = ['pos-open','pending','on-hold','cancelled'] as const` lives in **`@wcpos/sync-core`**: a wire fact the strip enforces; `sync-engine`, `query`, `core` already import this module; `sync-core` cannot import `order-math` (which re-exports it).
- `toOrderWirePayload(payload)`: aggregate strip + server-owned fields + server-owned and client-local meta entries + a non-pushable `status`. Same reference when clean.
- `orderChangesAssertIntent(changes, current?)` is false when every changed key is server-authored, server-owned, `date_modified_gmt`, a non-pushable or unchanged `status`, or a `meta_data` array whose remaining entries equal `current`'s (by key and value). Callers pass the resident payload they hold (`resident.ts:321-323`, `local-patch.ts:158`).

**Seams.** `sanitizeOutboundOrderPayload` calls `toOrderWirePayload` (enqueue, coalesce, recovery). `pushRecordMutation` (`recordPushAdapter.ts:188-205`) applies it to every `orders` payload at push time. No row written before protocol 3 reaches either seam (§1.5 parks them in their own generation).

**Status is an intent, never an echo.** A status reaches the wire only from a write whose own change set names it and changes it:
- `coalescedPayload` (`write-placement.ts:80-91`) takes `status` only from the prior or incoming payload, never the resident layer.
- `enqueueRecordWrite` (`push-record.ts:47-58`) omits `status` from an `update`; a `create` keeps it.
- Dead-letter recovery (`rebuiltRecoveryPayload`, `write-intents.ts:967-985`) takes `status` only from the recovered entry's own payload, never from the resident layer.
- Born-twice recovery (`write-intents.ts:1243-1304`) drops `status` from the discarded **create** snapshot before it merges into a successor or becomes the follow-up update; a successor's named status stays. A create's status never becomes an update intent.
- Both forms write `status` only when the cashier changed it: the cart form (`edit-order-meta/form.tsx:126-135`, its `patch` loses an unchanged `status`) and the orders form (`orders/edit/form.tsx:108-123`), which also shows `payment_method`, `payment_method_title`, `transaction_id` read-only. `OrderStatusSelect` takes `allowed`: the pushable set plus the current status, disabled when not pushable.
- Named writers that stay: reopen (`orders/use-reopen-order.ts:37`), the cart's send (`form.tsx:145-156`), void-order (`query/src/mutations/void-order.ts:85-89`).

**Server-owned meta on the resident.** `SERVER_ORDER_MONEY_META_KEYS` (`sync-core/src/pos-carrier/carrier.ts:57-63`) becomes `SERVER_OWNED_ORDER_META_KEYS` (epoch keys go, §1.6). The ack graft then adopts every server-owned key even with a successor queued (`collection-descriptors.ts:669-680`); `protectOrderMeta` (`resident.ts:319`) keeps the resident's value against any queued write. Local-only writers (§1.3's mirror, §1.5 PR B) use `patchEngineResident`.

**Failure story.** A missed non-pushable status is cleaned at both seams; a slipped server-owned key is dropped by the server and restored by the ack. No path re-sends a stale pushable status, so a note save on a till holding a stale `pending` copy of a paid order cannot reopen it. Real refusals reach the cashier through the awaited push's toast (SYNC201, server message) and Store health.

**Pins.**
- `sync-core/src/woo/orderWriteContract.test.ts`: `drops every server-owned and client-local key and keeps the rest of meta_data`; `drops a non-pushable status, normalising wc-, and keeps each pushable one`; `server-owned keys, unchanged meta or an unchanged status assert nothing`. Control: `a meta_data change to a till-owned key still asserts intent`.
- `sync-engine/src/materialization/sanitize-outbound-order-payload.test.ts`: `a coalesced snapshot carrying the resident ledger and a paid status leaves both off the wire`.
- `sync-core/src/recordPushAdapter.test.ts`: `an order row queued before the strip is cleaned at push time`.
- `sync-engine/src/write-path/write-placement.test.ts`: `a coalesce never takes status from the resident layer`.
- `sync-engine/src/write-path/write-intents.test.ts`: `recovering a rejected note edit does not re-send the resident's stale pending status`; `born-twice recovery against a paid server order carries no create status`.
- `query/tests/mutations/push-record.test.ts`: `an explicit order update push carries no status unless a queued write named it`.
- `query/tests/mutations/local-patch.test.ts`: `a patch that changes only _wcpos_payments is applied locally and not queued`.
- `query/tests/mutations/protected-order-meta.test.ts`: `a queued write cannot change a server-owned meta key on the resident`.
- `sync-engine/src/collections/remote-key.test.ts`: `an order ack adopts every server-owned meta key while a successor is queued`.
- `pos/cart/buttons/edit-order-meta/form.test.tsx`: `a note-only save does not write status`; `the status picker offers pushable statuses and shows a paid status read-only`.

### 1.3 The money command envelope (PR A)

**Module.** `packages/query/src/commands/money-command.ts` (engine access allowed; `core` calls named commands, ADR 0033). `post` is injected (the authenticated client lives in `core`). `moneyCommandPoster({ runtime, orderUuid, post, provenance, approval })` is a drop-in `(url, body) => Promise<{ data }>`.

**Approval.** `approval = { total, currency }` is frozen from the order at the cashier's press, **before** any provenance save or pre-flight push (the gateway path saves provenance first, `use-tender-flow.ts:944-965`, and only then builds its deps, `use-gateway-payment.ts:51-56`). It is passed explicitly: `gateway.submit(order, method, input, { approval })`, the terminal service's start input, `recordManualPayment`'s input, and `closeSale`. The poster never samples it itself.

**Definitive outcome** (what ends a command's life):
- a 2xx whose answered facts have been **persisted locally** by the mirror (the marker is cleared in the same local-only write as the mirror, never before);
- a refusal that names **this** command: a JSON 4xx carrying `data.payment.id` equal to the row id (`wcpos_order_already_paid`, `wcpos_amount_exceeds_balance`: the server stored the refused row), or 422 `wcpos_command_conflict` whose `data.command_id` (or, for `record`, `data.payment.id`) is ours, mirrored with the stored row;
- a JSON 4xx validation refusal (`rest_invalid_param`, `wcpos_payment_method_*`, `wcpos_invalid_transition`, `wcpos_fields_invalid`) answered **after** the lock was taken, which proves this delivery stored nothing — but only when no earlier delivery of the same command is unanswered; otherwise it is resolved by reading (below).
- **Not definitive:** 409 `wcpos_payment_locked` (the lock was held, nothing ran, `Order_Lock.php:132-147`), 409 `wcpos_revision_stale` (handled in step 9), any 5xx, a network error, a timeout, a non-JSON body.

**Resolution by reading.** When a command is not definitively resolved, a forced refresh (`settleMoneyCommand`) reads the order: a ledger row (or, for `submit`, an attempt in `_wcpos_gateway_attempts`) with the command's id resolves it with the stored status; absence resolves it as "not recorded" only after a delivery of the same command received a lock-taken JSON answer (any 4xx other than `wcpos_payment_locked`), because the server's ledger save is atomic with that lock.

`sendMoneyCommand` runs, in order:

1. **Classify** the path: `orders/{id}/payments` → record; `…/payments/{uuid}/{intent|capture|void|refund}`; `…/payment-methods/{method}/{submit|cancel}`; `orders/{id}/close`. Anything else (the `status` poll, bootstraps) passes through.
2. **Body**, frozen at first send. `provenance` is added for `record, intent, capture, submit, close`: with no `_wcpos_completions` it reads the till tuple `persistProvenance` stamped (no counter); with a completion history it mints `{ register_id, session_id, sale_time, sale_tz, sale_counter }` once per order and checkout attempt through `nextSaleCounter` (`checkout/provenance/stamp-completion.ts:23-61`), cached until a completion lands.
3. **Identity.** `record` sends none (`payment.id`). Others get one id per (order, kind, target, canonical body), held in memory and, for the kinds in step 4, in the marker; only a definitive outcome forgets it.
4. **Unresolved commands survive restart.** Before sending a `record`, `intent` or `submit` (the kinds that mint new money: a row or an attempt), the envelope writes `_wcpos_unresolved_command = { kind, path, commandId, body, approval, at, lockTakenAnswer: false }` local-only on the resident and awaits it. `capture`, `void`, `cancel`, `close` are not stored: their targets exist, so a re-issued one meets a state refusal (`wcpos_invalid_transition`) or a standing-completion replay, never a second money movement. Only the command lifecycle writes or clears the marker, through `patchEngineResident`; every other path preserves it:
   - **wire:** in `CLIENT_LOCAL_ORDER_META_KEYS`, stripped by `toOrderWirePayload`;
   - **server adoption and mutation merges:** `mergeProtectedOrderMeta` (`write-path/merge-protected-order-meta.ts:16-62`) gets a first branch for `CLIENT_LOCAL_ORDER_META_KEYS` in which the **resident's entry always wins, for `source: 'server'` and `'mutation'` alike** (today a mutation's value wins, `:47-51`), so a form-held meta array (`orders/edit/form.tsx:121, 148`; `protected-order-meta.ts:5-13`) can neither erase nor overwrite it;
   - **reset:** `isUnprotectedOrder` (`write-path/engine-order-repository.ts:652-658`) also returns false for a resident carrying the marker (`hasUnresolvedMoneyCommand`, new in `local-work-guard.ts`), so `resetForResync` (`:563-580`) keeps it. The **pull guard does not** consult it: pulls still adopt the order (keeping the marker by the merge rule), which is how resolution by reading works.
   The tender reads the marker (`readUnresolvedMoneyCommand(order)`, a named read) and, while it exists, offers no tile: only **Try again** (re-sends the same id and body with a fresh revision) and **Check with the store** (resolution by reading). Revision checking is **not** a dedupe: a new row id is always a fresh command.
5. **Pre-flight and revision.** Pending local work → await the explicit push (`pushRecord`) first; its refusal aborts the command. Revision: the chained answer revision while the resident's `sync.revision` still equals the one it chained from; else the resident's `sha256:` stamp; else one forced refresh (`refreshRecordByWooId`, `query/src/record-readers/refresh-records.ts:46-57`); still none → `MoneyCommandError('revision_unavailable')`.
6. **Approval guard.** Before every fresh `intent` or `submit`, the envelope compares `approval` (total **and** currency) with the document that belongs to the revision it is about to send: the resident when its stamp is that revision, the pre-flight push's acknowledged document, or the 409's `current` (step 9). A difference, or no such document, throws `MoneyCommandError('order_changed', { total, currency })` without posting.
7. **Post** `{ ...body, command_id?, revision }`.
8. **2xx** → remember `{ answer: data.revision, chainedFrom }`; return `{ data, sentAtRevision }`; the caller's mirror persists the facts and clears the marker in one write; the forced refresh runs after it. **`sync.revision` is never written alone**.
9. **409 `wcpos_revision_stale`** → for `intent`/`submit`, run step 6 against `data.current` first; then adopt `{ ...data.current, _rxdb_revision: data.currentRevision }` via `engine.adoptOrderSnapshot`. If adoption answers `'protected'` (`engine-order-repository.ts:281-286, 390-394`), `intent`/`submit` throw `MoneyCommandError('order_changed')` rather than re-send against a document the till never adopted; other kinds re-send (the server re-checks the money). Re-send once with the same id, body and `currentRevision`. A second stale → `MoneyCommandError('stale')`; the marker stays.
   A 409 `wcpos_payment_locked` re-sends the same command after its `retry_after` (bounded by `RECORD_UNKNOWN_RETRY_DELAYS_MS`, §1.5); the marker stays.
10. **422 `wcpos_command_conflict`, 428** → `MoneyCommandError('conflict' | 'revision_required')`, PAYMENT999 at error with order, kind, id; never retried.
11. Everything else is rethrown unchanged (callers' refusal handling: `record-manual-payment.ts:187-238`, `device-leg.ts:262-279`, `server-leg.ts:262-310`, `submit-gateway-payment.ts:98-130`, `void-payments.ts:111-121`).

**Mirror, then refresh.** `mirrorServerOrder` becomes a resolver over the **latest** resident: it upserts the answered row into the latest ledger (never the pre-command snapshot, `record-manual-payment.ts:153-154`), clears the marker when the answer is definitive, and writes the summary's status only while the resident's `sync.revision` still equals `sentAtRevision`; if a refresh already adopted a newer stamp, it writes only the marker clear (the adopted ledger already holds the row). After the mirror resolves, `settleMoneyCommand(runtime, orderUuid)` runs the forced refresh. Either order ends with the server's payload under the server's stamp.

**Call sites.** `use-record-manual-payment.ts:83`, `use-gateway-payment.ts:27`, `use-void-payments.ts:48`, the per-leg deps in `services/terminal-payments/service.ts` (`this.options.http` spread, ~443) and its capture at `:218`, the new `close` (§1.5): each `post` becomes `moneyCommandPoster(...)`; each mirror call is followed by `settleMoneyCommand`.

**Failure story.** Lost answer, same process: same id and body, the server replays. Lost answer, then `wcpos_payment_locked` while the first delivery still runs: not definitive, the marker stays, the next delivery replays. Lost answer and a restart, or a crash between the 2xx and the mirror: the marker blocks new tenders until Try again or Check with the store resolves it — one row. A form save or a journal reset cannot drop the marker. Concurrent writer: the approval is checked against the server's document before any re-send; a protected adoption never authorizes a charge. A provenance or pre-flight push that moved the total or currency stops a charge before it starts. Refresh fails or is protected: the mirrored local summary stands; the next queued push meets a 409, the drain's one-shot re-anchor carries it (`drainMutationQueue.ts:41-45`) and its ack adopts the document.

**Pins** (`query/tests/money-command.test.ts` unless named).
- `a capture retried after a lost answer re-sends the same command_id and body with a fresh revision`
- `record sends no command_id and a byte-identical body on retry`
- `an accepted partial cash record whose answer is lost survives restart as the unresolved command and its retry creates no second row`
- `a 2xx answer's revision chains to the next command and is never written to sync.revision`
- `a stale 409 adopts current with its stamp and re-sends once with the same id`
- `a pre-flight push that moves the total from 100 to 120 stops a submit with order_changed before posting`
- `a stale submit whose order total moved throws order_changed and does not re-send`
- `a stale submit whose currency moved at the same numeric total throws order_changed`
- `a stale answer whose adoption is protected never re-sends an intent or submit`
- `lost answer, then wcpos_payment_locked, then restart: the marker survives and the retry yields exactly one row`
- `a crash after the 2xx and before the mirror keeps the marker and mints no new identity`
- `Check with the store resolves the marker from a refreshed ledger holding the row id`
- `pos/checkout/tender/use-tender-flow.test.tsx`: `a provenance push that moves the total from 100 to 120 before the gateway deps are built stops the submit`
- `sync-engine/src/write-path/merge-protected-order-meta.test.ts`: `an older form meta snapshot can neither erase nor overwrite _wcpos_unresolved_command`
- `sync-engine/src/write-path/print-count-stash.test.ts` (the existing `resetForResync` suite): `resetForResync keeps a resident carrying an unresolved command, identity and frozen body intact across restart`
- `a second stale throws stale; 422 command_conflict and 428 throw without a retry`
- `a document without a sha256 stamp is refreshed once before the command`
- `provenance is read from the till tuple for completion 1 and minted once for a re-completion`
- `the status poll passes through without an envelope`
- `query/tests/mutations/mirror-server-order.test.ts`: `a refresh that lands before the mirror keeps the adopted payload and stamp`; `a mirror merges its row into the latest ledger, not the pre-command snapshot`
- `pos/checkout/tender/use-tender-flow.test.tsx`: `an unresolved command on the order hides the tiles and Try again re-sends it`

### 1.4 Captured-only counting and the signed balance (PR A)

**Change** in `order-math/src/payments/derive.ts`: counting is `captured` only (`:10`, D6). `signed = total − Σ captured + Σ succeeded allocations`; `balance = max(0, signed)`; new `refund_due = max(0, −signed)`, `refund_pending = Σ pending allocations` (never added). Complete when `total > 0 && signed ≤ 0`; `pos-partial` when Σ captured > 0; `pending` while a row is `pending`; else `pos-open`. `netPaidForBoundary` counts captured only (`paid-balance-boundary.ts:19`). `OrderPaymentSummary` (`order-math/src/payments/types.ts:197-204`) gains `authorized`, `refund_due`, `refund_pending`. `isSettledPaymentRow` (`ledger.ts:24-28`) is unchanged; §1.5 PR B uses it for the till's view of an offline authorization.

**Failure story.** Till and server agree on what is due, so cash on a reopened, partly refunded sale is not refused as `amount_exceeds_balance`.

**Pins** (`order-math/src/payments/derive.test.ts`): `a full authorization leaves the order pos-open with the balance still due`; `a succeeded refund on a reopened sale raises the balance and blocks completion until collected`; `captured money above a reduced total completes with refund_due`; `a pending refund allocation is refund_pending, never balance`. `pos/commands/paid-balance-boundary.test.ts`: `an authorized row does not cross the boundary`.

### 1.5 Offline tender and close (PR A refuses and parks; PR B queues)

**PR A — refused, never silent; nothing a protocol-2 client wrote is sent.** `next` is unreleased: a visible refusal is acceptable, a lost or replayed tender is not.
- **Rows written before protocol 3 are parked, never sent or reconciled** (Paul's ruling, §4.5). Mechanism: the repo's own pre-GA lever. `SCOPE_DATABASE_GENERATION` moves 6 → 7 (`sync-core/src/storeScopeIdentity.ts:66`) with the comment "7: protocol 3 (ADR 0040) — a protocol-2 queue is parked, never drained"; `drainable-generation.ts` becomes generation 6's schemas, which are today's (`DRAINABLE_SCHEMAS_GENERATION = 6`; no schema moved, so its recipe is today's creators); `schema-behaviour.test.ts` re-pins the digest map. A new constant `FIRST_PROTOCOL_3_SCOPE_GENERATION = 7` in `storeScopeIdentity.ts`; `drainLegacyScopeDatabase` (`legacy-scope-drain.ts`) checks it first: a drainable generation below it is **never pushed and never carried over** — it classifies the old queue without opening the engine, returns `kept` with `reason: 'written-before-protocol-3'`, `retryable: false`, and the host logs it (`create-app-engine.ts:504-534`) at error with PAYMENT201 on the first attempt of a process and then daily (`reportDue`), naming the unsent count, so it sits in Store health's log and the health header's stuck list. Why this mechanism: it is the one the repo already uses for every pre-GA schema break, the old rows never enter the new queue (so no coalesce, recovery or push seam can touch them, and the three legacy findings of Codex pass 2 cannot arise), and nothing in the new database is frozen: every resident re-ingests from the server, so no order is blocked and no local reset is needed. Cost: one full re-sync per till, and a dev till's unsent open carts stay in the parked database. A marker-in-place migration was rejected: held rows in the live queue would block every later write to their orders forever.
- **Tiles.** `OFFLINE_TENDERS_QUEUE = false` in `checkout/tender/tiles.ts` (commented "ADR 0040 PR B queues offline tenders as money commands; until then a tender the server cannot hear is refused") disables manual `offline: 'record'` and device `settlesLater` tiles with the `'offline'` reason when offline or `queued-offline` (`tiles.ts:171-180`). PR B deletes it.
- **Cash.** No offline write; an offline call returns `{ kind: 'failed', reason: 'offline_unavailable' }` (CHECKOUT101 toast). A 5xx or no answer re-sends the same command after each of `RECORD_UNKNOWN_RETRY_DELAYS_MS = [1000, 3000, 9000]` (rides out a proxy restart, short enough to wait at a till); still unknown → `{ kind: 'unknown', command }`, PAYMENT201, and the unresolved entry (§1.3 step 4) keeps Try again on screen across restarts.
- **Zero balance → `close`.** `writeZeroBalanceCompletion` writes its line changes **without** `status` (`zero-balance-completion.ts:52-59`), then `closeSale` sends `close` with provenance: 2xx with `completion` → `complete()`; 409 `wcpos_balance_outstanding` → mirror the summary, show what is due. Offline or `queued-offline` from the tender → CHECKOUT101 toast; from the boundary → no completion, debug log, the order stays `pos-partial`.
- **Void.** Offline → every live row is a refused `VoidPaymentsFailure` with the offline message (PAYMENT221); nothing voided locally.
- **Terminal.** `patchAndEnqueue` throws `offline_unavailable` (unreachable while device tiles are disabled offline).

**PR B — the outbox is the sync engine's own queue** (shape (a)).
- **Model.** `MutationOperation` gains `'command'`; `RecordMutation` gains `command?: { kind: 'record' | 'capture' | 'void' | 'close'; target: string | null; commandId: string | null; body: Record<string, unknown> }` and drops `expectedEpoch`. Following the pre-GA rule (`storeScopeIdentity.ts:55-66`), the queue schema changes **at version 8** and `SCOPE_DATABASE_GENERATION` moves 7 → 8; no v9 migration. `drainable-generation.ts` becomes generation 7's shipped schemas (queue v8 with `expectedEpoch`, operation enum `['create','update','delete']`, no `command`), and generation 7's rows (protocol 3, document writes only, since PR A queues no money) drain normally. Generation-6 databases become unreachable, as the bump rule says; they hold only parked protocol-2 work.
- **Enqueue.** Always `append`; never coalesced or a coalesce base; `explicit: true`, so the open-cart hold never holds a command and its prerequisite chain is released (`drainMutationQueue.ts:709-717`); `isOpenCartHoldCandidate` is false for `command` (`open-cart-hold.ts:51-56`), so the settled-snapshot discarder never removes a chain containing one (`order-pull-guard.ts:155-180`). Dirty-marks the resident. A never-pushed create→delete chain annihilates its commands with it.
- **Drain order.** A command is claimable only when its record has a `remoteId` **and** no `create`/`update` row for that record is pending, claimed or held, regardless of `seq`; so born-twice follow-ups, dead-letter requeues and recovered creates (`write-intents.ts:1123-1148, 1243-1304`, `write-placement.ts:38-65`) always land before the money command they precede. **A rejected prerequisite keeps blocking across drains**: the drain seeds `blockedRecords` for commands only (`drainMutationQueue.ts:518-529`) with every record holding a `rejected` `create`/`update` row of **lower `seq`** than one of its commands, until that dead letter is resolved (requeued and acknowledged, or discarded by the cashier); a rejected row of higher `seq` (a later, unrelated edit) does not block. Document rows keep today's behaviour.
- **Revision without a naked stamp.** A command's `revision` is read at claim from `sync.revision` when it is a stamp. Otherwise the drain fetches one **ephemerally**: the same read `refreshRevision` makes (`write-drain-lane.ts:568-601`), passed to this push only, never written to the resident. The manual rebase (`conflict-resolution.ts:364-385`) of a parked command row re-anchors the row's own revision and leaves the resident's `sync.revision` alone. The only revision writes a command causes are the ones that come with an adopted document.
- **Router.** `'command'` → `postMoneyCommand` (new, `sync-core`): 2xx → `acknowledged` with `currentRevision: null` and no document; 409 stale → `conflict` (`currentRevision`, `current`), so the order carve-out re-sends once (`write-drain-lane.ts:554-567`) and a second conflict parks (SYNC221); 409 `wcpos_order_already_paid`, `wcpos_amount_exceeds_balance`, `wcpos_balance_outstanding` and other 422 → `permanent` dead letter with the verdict (PAYMENT511/SYNC201) plus a `money-command-refused` event core turns into the tender's attention entry; 5xx/network → backoff; 401 → session wall. A requeue copies `command` verbatim.
- **Command acknowledgement.** Its own bookkeeping, not `facet.reconcile`'s: remove the mutation id from `pendingMutationIds`/`dirty` and write **no** revision (`collection-descriptors.ts:393-400` would otherwise stamp a document it never saw). Then **adopt a document**: `facet.fetchServerDocument` + the pull boundary. When successors are still queued the adoption is protected; the last successor's ack adopts the document and graft carries server-owned meta meanwhile (`:364, 669-680`); when none remain, the fetched document and its stamp land together.
- **Offline cash.** Enqueue the `record` command first, then patch the resident local-only (`_wcpos_payments` + `derive()` status); a failed patch logs PAYMENT111, the acknowledgement's adoption heals it.
- **Offline device authorization.** The **initial** authorization enqueues one `record` (`status: 'authorized'`, `recorded_offline: true`, the offline intent's `provider_refs`), body frozen. Later settlement references (`service.ts:199-205`) never re-enqueue `record` (a second body for the same id is 422). They are made durable at once as a **queued `capture` command** for that row (body `{ context: { provider_refs } }`, frozen, its own `command_id`), seq-ordered behind the `record`; the queue row, not the local ledger, is their durable copy, so the `record` acknowledgement adopting the server ledger (`collection-descriptors.ts:650-680`) cannot erase them, and a restart rebuilds nothing (`use-terminal-payments-service.ts:214-232` no longer needs the resident's refs for a queued capture). The service's in-memory capture path (`service.ts:186-230`) is used only for an online authorization; for an offline one it defers to the queued capture (`hasQueuedMoneyCommand`).
- **Till finish for an offline authorization.** D6 keeps the server order `pos-open` until capture. The till uses `tillBalance = balance − Σ offline-authorized rows (isSettledPaymentRow)`: the tender offers nothing more once it is 0, `isSaleComplete` for the `terminal` source compares `tillBalance` (`sale-completion.ts:272-273`), and `settlesSale` (`use-terminal-payments-service.ts:52-58`) accepts an open status when `tillBalance` is 0 through an offline authorization. The receipt shows the authorization; the order stays in open orders, paid in full pending capture.
- **Close and void.** Zero balance offline → queued `close`. Void offline goes through `withdrawMoneyCommand`, which follows the order-pull guard's bookkeeping-before-removal order (`order-pull-guard.ts:129-132, 166-180`):
  1. a local-only write stamps the ledger row `withdrawing: <mutationId>` and removes that id from `pendingMutationIds`/`dirty`;
  2. `removeNeverAttempted(mutationId)` (new; reuses `removeIfUnchanged`, `recordMutationQueue.ts:405-453`) removes the queue row only when it is pending, unclaimed and `attempts === 0`, under the stored revision;
  3. on success a local-only write sets the row `voided` and drops `withdrawing`; on refusal (claimed by another tab, or attempted with a lost answer) it restores the pending id, drops `withdrawing`, and queues a `void` command behind the `record`.
  An interrupted withdrawal leaves `withdrawing` on the row; the next engine start finishes it from the queue's truth (row gone → step 3 success; row present → step 3 refusal), so counted money always has either its command or a recoverable withdrawal. Card legs stay refused.

**Why (a), not a separate outbox (b).** The requirement is ordering behind the order's own document writes, and only this queue knows them; it already has durable rows, leases, a leader-serialised multi-tab drain, re-stamping, the 409 carve-out, backoff, the 401 wall, dead letters with verdicts, and the previous-generation drain. Cost: one operation, one router branch, command-specific acknowledgement, one generation bump (shared with §1.6's field removal).

**Pins.**
- PR A: `apps/main/lib/create-app-engine.test.ts`: `a row written before protocol 3 is never sent and is visible in Store health` (a generation-6 database with a queued order update and an offline cash ledger: nothing pushed, nothing carried, `kept` with `written-before-protocol-3`, one PAYMENT201 row). Control: `collections/schema-behaviour.test.ts` digest map for generation 6 equals today's. `checkout/tender/tiles.test.ts`: `offline and queued-offline orders disable manual and device tiles with the offline reason`. `record-manual-payment.test.ts`: `offline is refused and nothing is written`; `a 5xx re-sends the same row and body and ends unknown with the command`. `pos/commands/zero-balance-completion.test.ts` (new): `completes through close and never writes status`; `offline refuses with CHECKOUT101`. `void-payments.test.ts`: `offline voids nothing and reports every row refused`.
- PR B: `recordMutationQueue.test.ts`: `removeNeverAttempted refuses an attempted or claimed row`. `rxdb-upgrade-pending-orders.test.ts`: `a generation-7 database's queued document rows drain through the generation-8 engine`. Control, with a mutation check: `collections/schema-behaviour.test.ts` pins the generation-7 drainable digests; letting `command` or the new operation value leak into the drainable recipe must turn it red. `write-intents.test.ts`: `a command row is never coalesced, is explicit and dirty-marks the resident`. `drainMutationQueue.test.ts`: `a command waits for remoteId and for every document row of its record`; `a born-twice follow-up lands before the queued command`; `a rejected create requeued behind a command drains first`; `a prerequisite update rejected in one drain still blocks the queued close in the next, until resolved`; `a rejected later edit does not block an earlier command`; `a record replayed days later after the revision moved acknowledges once`. `write-drain-lane.test.ts`: `a command whose revision is fetched at claim leaves sync.revision unchanged, and after a definitive refusal the next pull still adopts the server's money facts`. `conflict-resolution` (in `write-drain-lane.test.ts`): `rebasing a parked command row does not stamp the resident`. `open-cart-hold.test.ts`: control `a command on a pos-open order is not held and releases its chain` (explicit rows already bypass the hold); `order-pull-guard.test.ts`: `a settled snapshot does not discard a chain holding a command`. `sync-core/src/moneyCommandAdapter.test.ts` (new): `maps 2xx, stale, refusals and 5xx onto push outcomes`. `write-drain-lane.test.ts`: `a command acknowledgement writes no revision and adopts the fetched document with its stamp`; `with a successor queued the document arrives with the successor's ack`. `record-manual-payment.test.ts`: `offline cash queues a record command and patches the ledger local-only`. `services/terminal-payments/service.test.ts`: `authorization, settlement event, reconnect: exactly one unchanged record and the refs in the capture`; `settlement refs arrive while the record is queued, the record acknowledges, restart before capture: the capture still sends those refs exactly once`; `capture defers while the authorization's record is queued`; `an offline authorization covering the sale completes the terminal settlement without a paid status`. `server/use-terminal-payments-service.test.tsx`: `an offline authorization enters the receipt with the order pos-open`. `void-payments.test.ts`: `a never-attempted queued record is withdrawn`; `a record that was attempted (lost answer, back to pending) gets a void queued behind it`; `a competing tab claiming the row during withdrawal leaves it and queues the void`; `a successful withdrawal with no successors leaves no pending id and the resident pullable`; `a withdrawal interrupted after the bookkeeping write is finished at the next start from the queue's truth`.

### 1.6 Retire the epoch-era 1.3 gate (PR A; merges before server PR 5)

**Change.** Delete the envelope gate and fields (`write-drain-lane.ts:626-633`, `recordPushAdapter.ts:130-131, 195-196`), the epoch stamping (`write-intents.ts:692-694, 767-769`, `conflict-resolution.ts:364-366`), `readMoneyEpoch`/`readResidentMoneyEpoch` (`sync-core/src/payments-contract.ts:18-25`, `query/src/reads/order-money-epoch.ts`), the epoch keys in `carrier.ts:57-63`. `serverOwnsMoney` honours the durable hint at every contract and stops reading `_wcpos_money_owner` (`money-owner.ts:6-18`); the hint writer drops its stand-down (`money-owner-hint-writer.ts:24-27`); the latch keys on the uuid (`order-money-divergence/index.tsx:193-199, 248-250`); `settle-cart-write.ts:59-68` stops copying `_wcpos_money_owner`. `RecordMutation.expectedEpoch` stays unread (no schema change in PR A beyond the generation move of §1.5) until PR B drops it. `APP_PAYMENTS_CONTRACT` stays `'1.3'`.

**Failure story.** Without it, server PR 5 dead-letters every order update (400) and re-settles every diverged order locally (ADR 0032's oscillation).

**Pins.** `sync-engine/src/write-path/payments-contract.test.ts` (rewritten): `no contract puts expectedEpoch or tillAggregate on the push envelope`. `money-owner.test.ts`: `the durable hint owns money at every contract`. `money-owner-hint-writer.test.ts`: `writes the hint at contract 1.3`. `server-money-reader.test.tsx`: `ownership latched for an order survives a change to its _wcpos_money_epoch meta`. Deleted with their subjects: `recordPushAdapter.test.ts` "passes the optional payments 1.3 envelope fields unchanged"; `line-identity-reconciliation.test.ts` "manual rebase replaces the queued epoch…"; `merge-protected-order-meta.test.ts` "server adoption replaces a protected epoch"; `settle-cart-write.test.ts` "settles a 1.3 order whose stamp was cleared…"; `settlement-coordinator.test.ts` "ignores the pre-1.3 hint after reopen"; `settlement-coordinator-provider.test.tsx` "wakes a hint-only open order when the store contract resolves to 1.3".

### 1.7 Refunds (PR C)

**Ground truth (Pro `next`).** `POST wcpos/v2/orders/{id}/refunds` is Pro's `Order_Refunds_Controller` (`includes/API.php:92, 110`; `API/V1/Order_Refunds_Controller.php:124-156`). Allocations over captured rows, newest first (`Payments/Refund_Processor.php:280-333`), each through free `Ledger::refund()`. WooCommerce's `api_refund` is the plan's, false for ledger plans (`:462`, `RefundPlan.php:115-117`); the client's is read only without `refund_destination` (`:231-241`). Answers carry `refund_result.allocations[{ payment_id, method_id, amount, status, provider_ref }]` (`succeeded`, `pending`, or `failed` after an earlier leg succeeded, HTTP 201; `:382-401`). Idempotency: the key is checked for conflict, then a cached result is replayed, then reserved (`:106-121`); a held reservation answers 409 **`wcpos_idempotency_in_progress`** and a different body under the key 409 `wcpos_idempotency_conflict`, neither cached (`Payments/Idempotency_Repository.php:127-140`); plan and execution outcomes, including errors, are cached 24 h (`Refund_Processor.php:129-145`).

**Change.** `api_refund` unchanged. The key is minted per form submission and held with its frozen body until the outcome is definitive:
- **Kept** (retry re-sends the same key and body): no answer, timeout, `wcpos_idempotency_in_progress`, and any 5xx or non-JSON body (a proxy error proves nothing was cached).
- **Spent** (the next submission mints a new key): a 2xx, or a 4xx WordPress error body (`{ code, data.status }`) other than `wcpos_idempotency_in_progress`, which Pro cached as the definitive refusal.
- `wcpos_idempotency_conflict` is a client bug: logged PAYMENT999, key kept, no automatic retry.

The mutation returns `refund_result.allocations`; `refund-failure.ts` reports `pending` as REFUND_OUTCOME_UNKNOWN (PAYMENT311, "sent to {method}, not confirmed") and a `failed` leg as a partial refund naming it, never as success.

**Pins** (`orders/refund/use-refund-mutation.test.ts`): `a retry after no answer re-sends the same key and body`; `wcpos_idempotency_in_progress keeps the key and the later retry replays the stored result`; `a non-JSON 502 keeps the key`. Control (today every call mints a key): `a cached wcpos_refund_not_allocatable spends the key`. `refund-failure.test.ts`: `a pending allocation is reported as unconfirmed`; `a failed leg after a succeeded one is a partial refund`.

## 2. Signatures

```ts
// sync-core/src/woo/orderWriteContract.ts
export const PUSHABLE_ORDER_STATUSES: readonly ['pos-open', 'pending', 'on-hold', 'cancelled'];
export type PushableOrderStatus = (typeof PUSHABLE_ORDER_STATUSES)[number];
export const SERVER_OWNED_ORDER_FIELDS: readonly string[];
export const SERVER_OWNED_ORDER_META_KEYS: readonly string[];
export const CLIENT_LOCAL_ORDER_META_KEYS: readonly ['_wcpos_unresolved_command'];
export function isPushableOrderStatus(status: unknown): status is PushableOrderStatus;
export function toOrderWirePayload<T extends Record<string, unknown>>(payload: T): T;
export function orderChangesAssertIntent(changes: Record<string, unknown>, current?: Record<string, unknown>): boolean;
// sync-core/src/storeScopeIdentity.ts (PR A)
export const SCOPE_DATABASE_GENERATION = 7; // PR B: 8
export const FIRST_PROTOCOL_3_SCOPE_GENERATION = 7; // a drainable generation below it is parked, never sent
// sync-engine/src/write-path/local-work-guard.ts (PR A)
export function hasUnresolvedMoneyCommand(document: unknown): boolean; // guards reset/removal, not pulls

// query/src/commands/money-command.ts
export type MoneyCommandKind = 'record' | 'intent' | 'capture' | 'void' | 'refund' | 'submit' | 'cancel' | 'close';
export interface CommandProvenance { register_id?: string; session_id?: string; sale_time?: string; sale_tz?: string; sale_counter?: string }
export interface MoneyCommand {
	readonly orderUuid: string; readonly kind: MoneyCommandKind; readonly path: string;
	readonly target: string | null; readonly commandId: string | null; // null for record
	readonly body: Readonly<Record<string, unknown>>; // frozen, without command_id / revision
	readonly approval: OrderApproval; // frozen at the cashier's press, before any provenance push
}
export type MoneyCommandErrorReason = 'revision_unavailable' | 'order_changed' | 'stale' | 'conflict' | 'revision_required';
export class MoneyCommandError extends Error { readonly reason: MoneyCommandErrorReason; readonly command: MoneyCommand; readonly order?: OrderPaymentSummary }
export function classifyMoneyRoute(path: string): { kind: MoneyCommandKind; orderId: number; target: string | null } | null;
export function sendMoneyCommand(runtime: QueryRuntime, command: MoneyCommand, deps: { post: Post }): Promise<{ data: Record<string, unknown> & { revision?: string }; sentAtRevision: string }>;
export function settleMoneyCommand(runtime: QueryRuntime, orderUuid: string): Promise<void>; // forced refresh, after the mirror
export interface OrderApproval { readonly total: string; readonly currency: string }
export type CommandOutcome = 'accepted' | 'refused-stored' | 'not-recorded' | 'unresolved'; // definitive except 'unresolved'
export function moneyCommandPoster(input: { runtime: QueryRuntime; orderUuid: string; post: Post; approval: OrderApproval; provenance?: () => Promise<CommandProvenance | null> }): Post;
export function resolveByReading(runtime: QueryRuntime, orderUuid: string): Promise<CommandOutcome>; // "Check with the store"
export function readUnresolvedMoneyCommand(order: EngineRecord<'orders'>): MoneyCommand | null; // named read
type Post = (url: string, body: unknown) => Promise<{ data: unknown }>;

// query/src/mutations/mirror-server-order.ts
export function mirrorServerOrder(manager: QueryRuntime, uuid: string, answer: { payment?: PaymentRow; order?: OrderPaymentSummary; meta?: MetaDataEntry[] }, options: { sentAtRevision: string }): Promise<'mirrored' | 'superseded'>;

// core: checkout/provenance/command-provenance.ts; pos/commands/close-sale.ts
export function commandProvenance(ctx: SaleContext, order: EngineRecord<'orders'>, sessionId: string | null): Promise<CommandProvenance | null>;
export type CloseOutcome =
	| { kind: 'completed'; order: OrderPaymentSummary; completion: { n: number; id: string } | null }
	| { kind: 'outstanding'; order: OrderPaymentSummary }
	| { kind: 'refused'; code: string; message: string }
	| { kind: 'offline' }; // PR B: { kind: 'queued' }
export function closeSale(runtime: QueryRuntime, order: EngineRecord<'orders'>, deps: { post: Post; provenance: () => Promise<CommandProvenance | null>; online: boolean }): Promise<CloseOutcome>;
// record-manual-payment.ts adds: { kind: 'failed'; reason: 'offline_unavailable' } | { kind: 'unknown'; command: MoneyCommand }

// PR B — sync-core / query
export type MutationOperation = 'create' | 'update' | 'delete' | 'command';
export interface MoneyCommandMutation { kind: 'record' | 'capture' | 'void' | 'close'; target: string | null; commandId: string | null; body: Record<string, unknown> }
export function postMoneyCommand(input: { mutation: RecordMutation & { command: MoneyCommandMutation }; remoteId: number; revision: string; baseUrl: string; fetcher: Fetcher; signal?: AbortSignal }): Promise<PushResult>;
// RecordMutationQueue
removeNeverAttempted(mutationId: string): Promise<boolean>; // unclaimed, pending, attempts === 0, in one transaction
export function hasQueuedMoneyCommand(runtime: QueryRuntime, orderUuid: string, paymentId: string): Promise<boolean>;
export function withdrawMoneyCommand(runtime: QueryRuntime, orderUuid: string, paymentId: string): Promise<'withdrawn' | 'void-queued'>;
// order-math
export function tillBalance(view: DerivedOrderView, rows: readonly PaymentRow[], dp: number): string;
```

## 3. PR sequence and budgets

Each PR merges before the next branches (worktrees off `origin/next`); per-slice commits stay intact (Paul, 2026-10-19).

**PR A — protocol 3 and the money envelope** (`feat/adr-0040-client-a`). Slices: A1 §1.1; A2 §1.2 (strip, status-intent across coalesce, full push, both recovery builders and both forms); A3 §1.6; A4 §1.4; A5 §1.3 (envelope, definitive-outcome rules, unresolved-command marker with its merge and reset guards, approval carried from the press, mirror resolver, six call sites, provenance); A6 §1.5 PR A (generation 7 parking, refusals, `closeSale`); plus this spec and the `order-birth.ts:18-21` comment. A6 adds `sync-core/src/storeScopeIdentity.ts`, `sync-engine/src/collections/drainable-generation.ts`, `write-path/legacy-scope-drain.ts`, `write-path/engine-order-repository.ts`, `write-path/local-work-guard.ts`, `apps/main/lib/create-app-engine.ts` to the file list below.
Files: `utils/src/sync-protocol.ts`; `core/src/screens/auth/hooks/use-api-discovery.ts`; `en/core.json`; the three E2E files; `sync-core/src/woo/orderWriteContract.ts`, `recordPushAdapter.ts`, `pos-carrier/carrier.ts`, `payments-contract.ts`, `index.ts`; `sync-engine/src/materialization/sanitize-outbound-order-payload.ts`, `write-path/{write-placement,write-intents,write-drain-lane,conflict-resolution,merge-protected-order-meta}.ts`, `collections/collection-descriptors.ts`; `query/src/mutations/{push-record,resident,local-patch,order-birth,mirror-server-order}.ts`, `reads/order-money-epoch.ts` (deleted), `commands/money-command.ts` (new); `order-math/src/payments/{derive,types,money-owner}.ts`; `core/…/checkout/payments/{record-manual-payment,use-record-manual-payment,use-gateway-payment,use-void-payments,void-payments,submit-gateway-payment}.ts`, `server/use-terminal-payments-service.ts`, `checkout/provenance/command-provenance.ts` (new), `checkout/tender/{tiles,use-tender-flow}.ts`, `pos/commands/{zero-balance-completion,close-sale (new),boundary-commit,paid-balance-boundary,money-owner-hint-writer,settle-cart-write}.ts`, `pos/contexts/order-money-divergence/index.tsx`, `services/terminal-payments/service.ts`, `components/order/order-status-select.tsx`, both edit forms, `seam-allowlist.ts` if a fingerprint moves.
Budget **≤ 1,050 added / about 380 deleted** non-test lines (750 in the first draft; 950 after review 1; review 2 adds the definitive-outcome rules and resolution by reading, the marker's merge and reset guards, approval carriage with currency, and the generation-7 parking, and removes the pre-upgrade hold). Stakes High.

**PR B — the offline tender outbox** (`feat/adr-0040-client-b`): §1.5 PR B. Files: `sync-core/src/{recordMutation,recordMutationQueue,drainMutationQueue,moneyCommandAdapter (new),recordPushAdapter,index}.ts`; `sync-core/src/storeScopeIdentity.ts` (generation 8); `sync-engine/src/write-path/{write-intents,write-placement,write-drain-lane,open-cart-hold,order-pull-guard,conflict-resolution}.ts`, `collections/{drainable-generation,collection-descriptors}.ts`; `query/src/commands/money-command.ts`, two named reads; `order-math/src/payments/derive.ts` (`tillBalance`); core payment files, `checkout/sale-completion.ts`, `tiles.ts` (constant deleted), `services/terminal-payments/service.ts`, `server/use-terminal-payments-service.ts`, `close-sale.ts`. Budget **≤ 850 added** (550 in the first draft; 800 after review 1; review 2 removes the pre-upgrade reconciliation and the v9 migration, and adds persistent blocking by rejected prerequisites, ephemeral command revisions, the queued capture for settlement refs, and withdrawal bookkeeping with its restart sweep). Stakes High (queue schema, generation bump).

**PR C — refunds** (`feat/adr-0040-client-c`): §1.7. Files: `orders/refund/{use-refund-mutation,refund-failure,form}.ts(x)`. Budget **≤ 120 added** (was 90).

**Server PR 5 waits for PR A** (§1.6). This spec is the client handoff.

**Verification order, every PR.** (1) One jest invocation at a time, `--maxWorkers=2`, failing pins first: `sync-core`, `order-math`, `sync-engine` `write-path/` `materialization/` `collections/`, `query`, `core` (payment, tender, commands, forms, then `seam.test.ts`), `utils`. (2) `pnpm translations:check`, typecheck and lint per touched package, `git diff --check`. (3) Mutation checks: status from the resident in `coalescedPayload` or `rebuiltRecoveryPayload` → their pins fail; write `sync.revision` from the answer → the chain pin fails; drop the unresolved store → the restart pin fails; restore `authorized` → the authorization pin fails; restore the 1.3 gate → the payments-contract pin fails; clear the marker on `wcpos_payment_locked` → the lock pin fails; let the drain push a generation-6 queue → the parked-row pin fails; (PR B) leak `command` into the generation-7 drainable recipe → the digest control fails. (4) A dev till upgraded to PR A re-syncs once and shows its parked generation-6 work in Store health. Publish `@next`; on dev-next: a single cash sale, a cash split, a card leg if a reader is at hand, reopen a paid sale and close it unchanged (completion 2), a pos-partial boundary close, kill the app between a cash POST and its answer and relaunch (one row), offline cash refused (PR A) / queued, restarted, replayed with one row (PR B). (5) Dispatch `deploy.yml lane=next` for `protocol-signal`, `update-required`, `checkout-tender`. PR B adds a two-tab run.

## 4. Decisions this spec makes that Paul should see

1. **A command answer's revision is never written to `sync.revision` alone.** It chains in memory; the document and its stamp arrive together by a forced refresh after the caller's mirror (one GET per command). Alternatives: the revision alone (the next pull skips the server's payment fields) or the server returning `current` on 2xx (saves the GET; a server change).
2. **Status is an intent, never an echo**, across every producer: coalesce, full push, dead-letter and born-twice recovery, both forms. Under ADR 0040 a stale `pending`/`pos-open` is a reopen. Cost: a status change must be named.
3. **Charge-starting commands re-check the cashier's approval (total and currency)**, frozen at the press before any provenance push, against the server document for the revision being sent; a protected adoption never authorizes a re-send. `record`, `capture`, `void`, `cancel`, `close` re-send once on stale because the server re-checks the money.
4. **Unresolved row- or attempt-minting commands are stored on the order, local-only, until a definitive outcome** (a 2xx persisted by the mirror, or a refusal naming this command; never `wcpos_payment_locked`, 5xx or no answer). The tender offers only Try again and Check with the store meanwhile; form saves, pulls and journal resets cannot drop the marker. Chosen over pulling PR B's queue row into PR A: one meta key versus a queue schema change.
5. **Queue rows written by a protocol-2 client are parked, never sent or reconciled** (Paul's ruling, 2026-10-20, D1's reasoning: no shipped client has the payments ledger; a pre-upgrade queue holding offline ledger rows or a copied status is a dev-till artefact). Mechanism: PR A moves the scope generation 6 → 7 and the previous-generation drain refuses a generation below 7 — no push, no carry-over — reporting it as PAYMENT201 in Store health. Nothing in the new database is frozen (every order re-ingests from the server); the cost is one re-sync per till and a dev till's unsent open carts staying in the parked database.
6. **The offline outbox is the sync engine's queue** (`operation: 'command'`, explicit, drained after its record's document rows and blocked by a rejected earlier one, its own acknowledgement, no naked revisions), not a second outbox. PR B changes the queue at version 8 and moves the generation 7 → 8, per the pre-GA rule, instead of a v9 migration.
7. **PR A refuses offline tenders, the offline zero-balance close and offline voids** with visible reasons; offline cash returns in PR B.
8. **Provenance rides completion-capable commands**; a counter is allocated only for a re-completion (a refused one leaves a gap, as today: `zero-balance-completion.ts:42-44`).
9. **The 1.3 epoch gate is retired in PR A and server PR 5 waits for it**; line-money ownership returns to the durable hint.
10. **Refunds keep `api_refund`**; the key survives every unresolved outcome and is spent only on a 2xx or a cached refusal.
11. **An offline card authorization finishes the sale at the till (`tillBalance` 0) while the server order stays `pos-open` until capture** (D6); it stays visible in open orders, paid in full pending capture.

## 5. Open questions

1. **How does a zero-total sale complete?** `close` refuses `total ≤ 0` (`Ledger.php:1755`) and the push refuses `completed` (`Order_Writer.php:915-925`): a 100 %-discount sale, or a cash due rounded to nothing, has no route under protocol 3. Server SPEC §7.8 assumed the old path survived; server PR 1 removed it. Needs a server change; recommendation: `close` completes a zero-total open order with no rows through `payment_complete()`. The client sends `close` either way; until then PR A answers the 409 with CHECKOUT101 and the sale stays open.

## 6. Review log

Codex read-only review of the first draft, 2026-10-20 (13 findings). Every finding's evidence was re-read against the code; all held.

1. P1 pre-upgrade tenders erased — **taken**: PR A holds rows carrying unsent offline tenders (dead letters stop protecting the resident, `recordMutationQueue.ts:1206-1211`); PR B reconciles by row id. Superseded by Paul's pass-2 ruling: such rows are parked in generation 6, never sent or reconciled. §1.5.
2. P1 restart re-mints a tender — **taken**: the "revision refuses it" claim was false (a new row id is fresh); unresolved `record`/`intent`/`submit` stored local-only on the order, tender blocked until resolved. §1.3 step 4.
3. P1 refund key spent on in-progress — **taken**: key kept on in-progress, no answer, 5xx and non-JSON; spent on 2xx or a cached refusal; the two non-pins replaced. §1.7.
4. P1 status echoes outside two producers — **taken**: cart form, dead-letter recovery, born-twice recovery added with pins. §1.2.
5. P1 pre-flight changes the total without a stale — **taken**: total guard before every fresh intent/submit. §1.3 step 6.
6. P1 mirror after refresh erases adopted facts — **taken**: mirror is a resolver over the latest resident, guarded by `sentAtRevision`; refresh runs after the mirror. §1.3.
7. P1 withdrawing a maybe-sent record — **taken**: withdrawal only when unclaimed and never attempted, atomically; else a void queued behind. §1.5 PR B.
8. P2 command ack writes a revision without a document — **taken**: command-specific acknowledgement, no revision, actual document adoption. §1.5 PR B.
9. P2 commands held / discarded as cart edits — **taken**: commands explicit, not hold candidates, never discarded. §1.5 PR B.
10. P2 recovery puts document work behind a command — **taken**: commands drain after every document row of their record. §1.5 PR B.
11. P2 settlement refs rebuild the frozen record — **taken**: one initial `record`; refs go local and into capture. §1.5 PR B.
12. P2 `isSettledPaymentRow` alone does not finish the sale — **taken**: `tillBalance` drives terminal completion and receipt entry; decision 11 corrected. §1.5 PR B.
13. P2 v9 changes the frozen v5 schema — **taken**, then superseded by pass 2: PR B moves the generation instead of migrating, and the generation-7 drainable recipe is pinned (control plus mutation check).

Codex pass 2, 2026-10-20 (12 findings, closure audit of pass 1), with Paul's ruling that protocol-2 queue rows are parked, never reconciled. Evidence re-read; all held.

1. P1 a non-stale 4xx (e.g. `wcpos_payment_locked`) is not definitive; the marker was cleared before the mirror persisted — **taken**: definitive outcome defined (2xx after the persisted mirror; a refusal naming this command); lock, stale, 5xx, network and non-JSON are not; resolution by reading added. §1.3.
2. P1 the marker dies under form meta replacement and journal reset — **taken**: resident-wins branch in `mergeProtectedOrderMeta` for both sources; `hasUnresolvedMoneyCommand` guards `resetForResync`, not pulls. §1.3 step 4.
3. P1 coalescing strips a pre-upgrade tender before the hold — **taken by ruling**: protocol-2 rows stay in generation 6 and never meet a coalesce. §1.5.
4. P1 reconciliation sends money before its prerequisites — **taken by ruling**: reconciliation deleted. §1.5.
5. P1 a stored failed row matched as reconciled — **taken by ruling**: reconciliation deleted. §1.5.
6. P1 approval sampled after the provenance push; protected adoption authorizes a re-send; currency ignored — **taken**: approval frozen at the press and passed through gateway, service, record and close inputs; compared with the document for the revision sent; protected adoption refuses intent/submit; currency compared. §1.3.
7. P1 pre-upgrade queued status echoes — **taken by ruling**: those rows are parked. §1.5.
8. P1 record acknowledgement erases settlement refs before capture — **taken**: refs become a queued, frozen `capture` command at once. §1.5 PR B.
9. P1 a rejected prerequisite stops blocking its command — **taken**: commands are blocked across drains by a rejected lower-seq document row until it is resolved. §1.5 PR B.
10. P2 `refreshRevision` and rebase stamp a naked revision for commands — **taken**: ephemeral revision at claim; rebase of a command row leaves the resident alone. §1.5 PR B.
11. P2 withdrawal leaves resident bookkeeping — **taken**: bookkeeping-before-removal with a `withdrawing` marker and a restart sweep. §1.5 PR B.
12. P3 controls labelled as pins — **taken**: the refund key-spend assertion, the explicit-row hold assertion and the drainable digest pins are marked controls; the drainable recipe gets a mutation check.
Closure audit: pass-1 #1 and #2's upgrade half are closed by the ruling; #2's lifecycle half by pass-2 #1–#2; #5 by pass-2 #6.
