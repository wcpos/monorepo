# Handoff — retire the per-line tax hooks onto `calculateCartLine`

**Repo:** wcpos/monorepo · **Lane:** `main` · **Parent issue:** #1472 (open)
**Date:** 2026-08-23 · **Prerequisite:** PR #1509 — MERGED (`929a33e678`), see §8

---

## 1. Read this first

There are **two copies of WooCommerce's line-tax rounding** in this repo. One ships. One is
tested but dead.

`packages/order-math/src/cart-line.ts:238` says so itself:

> `Port of calculateLineItemTaxesAndTotals (use-calculate-line-item-tax-and-totals.ts).`

I diffed them. `consolidateTaxes` at `cart-line.ts:205-236` and at
`use-calculate-line-item-tax-and-totals.ts:21-60` are **logically identical** — same
`roundTaxTotal` gating, same `roundHalfUp(x, 6).toFixed(6)`. The main bodies match line for
line (`price * quantity`, `perUnitTaxResult`, `priceWithoutTax`, `roundHalfUp(…, roundingPrecision)`).

The job is to delete the shipped copy and route its 8 callers through the package one.

**Do not start by reading `settle.ts`.** Start with the three hooks in §3 and
`packages/order-math/src/cart-line.ts`.

---

## 2. Why this is worth doing, in one paragraph

The duplication is not stylistic — it is a **correctness liability with a documented instance.**

`use-calculate-line-item-tax-and-totals.ts:49-55` carries this comment:

> Fixed contract width, never `String()`: `String(3.67647)` drops the trailing zero and emits 5
> decimals, which reads as a NARROWER money value than the 6dp contract. […] a dropped zero
> turned a cross-engine tie into a cashier-facing "your store changed this order's totals"
> banner on a correct sale (woocommerce-pos#1548). **Mirrors cart-line.ts.**

Someone fixed that parity bug **twice** and left a note because they knew it would recur. The
note exists in only one of the two copies. The same is true in the other direction: the shipping
implementation in `cart-line.ts:444-446` carries a `QUIRK(parity)` note — *"rounding mode uses
the PER-LINE `amountIncludesTax` (unlike fees, which use store `pricesIncludeTax`)"* — that the
core hook does **not** have.

**This now matters more than it did last week.** ADR 0032 (merged 2026-08-23) makes an
order-money divergence mean *"a product invariant is broken"*, non-dismissible, escalating to a
store-level support prompt after three orders. Duplicated line-tax rounding is the single most
likely source of **false** divergence. The escalation is only meaningful while divergence stays
rare, so two copies of this maths quietly undermine the decision we just shipped.

---

## 3. Scope

**Delete these three hooks:**

| hook | LOC |
|---|---|
| `packages/core/src/screens/main/pos/hooks/use-calculate-line-item-tax-and-totals.ts` | 155 |
| `packages/core/src/screens/main/pos/hooks/use-calculate-fee-line-tax-and-totals.ts` | 108 |
| ~~`packages/core/src/screens/main/pos/hooks/use-calculate-shipping-line-tax-and-totals.ts`~~ | ~~69~~ — **DONE**, stage 1 |

**Eight call sites, all with sibling test suites already in place:**

`use-add-fee.ts` · `use-add-item-to-order.ts` · `use-add-product.ts` · `use-add-shipping.ts` ·
`use-add-variation.ts` · `use-update-fee-line.ts` · `use-update-line-item.ts` ·
`use-update-shipping-line.ts`

**Replace with:** `calculateCartLine(input, config)` from `@wcpos/order-math` (public surface,
already exported). Signature at `cart-line.ts:464-480`, overloaded per kind:

```ts
| { kind: 'line_item'; line: LineItemInput; changes?: LineItemChanges }
| { kind: 'fee'; line: FeeLineInput; changes?: FeeLineChanges;
    cartLineItems: readonly LineItemInput[] }   // percent basis — EXPLICIT
| { kind: 'shipping'; line: ShippingLineInput; changes?: ShippingLineChanges }
```

Returns `CalcLineResult<T>` — `{ line, warnings }`.

---

## 4. The config plumbing — this is the actual work

The hooks read tax settings from React context (`useTaxSettings`, `useCalculateTaxesFromValue`).
`calculateCartLine` takes a `CartConfig` instead. Every call site needs one.

**Copy the model already in the tree.** `use-cart-settlement.ts` builds it exactly once, memoised:

```ts
const cartConfig = React.useMemo(
  () => createCartConfig({
    rates, allRates, calcTaxes, pricesIncludeTax, taxRoundAtSubtotal,
    dp: priceNumDecimals,
    shippingTaxClass: taxClassToWire(taxClassFromWire(shippingTaxClass)),
    calcDiscountsSequentially,
  }),
  [/* every input above */]
);
```

Strongly consider extracting that into a `useCartConfig()` hook in
`packages/core/src/screens/main/pos/hooks/` as **stage 0**, and re-pointing
`use-cart-settlement.ts` at it. Eight call sites each hand-rolling the same memo is how the
three copies of this maths happened in the first place.

Note `taxClassToWire(taxClassFromWire(shippingTaxClass))` — that round-trip is deliberate,
not redundant. Keep it.

---

## 5. Suggested order — three PRs, easiest first

Each stage is its own PR with its own live E2E run. **Do not big-bang this.**

0. **`useCartConfig()`** — **DONE**, landed with stage 1 at
   `packages/core/src/screens/main/pos/hooks/use-cart-config.ts`. `use-cart-settlement.ts` now
   reads it instead of hand-rolling the memo, and its `configKey` is serialised from the config
   itself. Every remaining stage should call it, not rebuild it.
1. ~~**Shipping**~~ — **DONE**, stage 1. Two notes for the stages that follow:
   - `ShippingLineChanges` had to widen to `Partial<ShippingLineInput>` + `instance_id`: the
     edit form submits the WHOLE line, and the narrow shape silently dropped `meta_data` from
     the type while the runtime spread kept passing it. **Check the fee and line-item Changes
     shapes against their real callers before assuming they are complete.**
   - `calculateCartLine` passes tombstoned lines through untouched; the hooks did not have that
     check. Behaviour improvement, but worth knowing it is a difference.
2. **Fee** (108 LOC, 2 call sites). Watch the `cartLineItems` percent basis: the hook read it
   via `getLatest()` mid-calculation; `calculateCartLine` requires it as an explicit input.
   That is a deliberate design change, and the call site now has to supply it.
3. **Line item** (155 LOC, 4 call sites). Hottest path in the app — every product, variation
   and quantity change.

4. **Widen the differential harness, then retire the oracle.** Port compound rates, `dp: 0`,
   `taxRoundAtSubtotal: true` and tombstoned lines into
   `settle-cart-differential.test.ts` — parameterise its `makeConfig`, which currently takes
   only `pricesIncludeTax` — then delete `settle.oracle.test.ts` with a `Test-Removal:`
   trailer. Do this LAST: once the hooks are gone, the differential is comparing settle against
   a composition that actually ships, so widening it is worth more then than now.
   **Take the compound fixture from `internal/coupons/compound-tax-priority.test.ts`, not from
   the oracle's case 4** — see the correction in §8.2 for why.

After stage 3, delete `getRoundingPrecision` / `roundHalfUp` / `roundTaxTotal` from the core
import surface if nothing else needs them, and re-check what still imports
`@wcpos/order-math/internal` (18 files today; §7 lists the three that stay by design).

---

## 6. Traps specific to this area

- **Unit tests cannot see the bug class that bit #1505.** 2,190 passed while a couponed cart
  saved `discount_total: 0`. Every failure there was *when a write fires and whether it is
  allowed*. This work touches the write path for every line mutation. **The E2E gate is the
  only real check** — budget a deploy plus ~13 min of E2E per stage.
- **`e2e/pos-cart.spec.ts` and `e2e/pos-coupon-apply.spec.ts` are the specs that matter.**
  Confirm they actually RAN, don't trust a green shard: `gh api repos/wcpos/monorepo/actions/jobs/<id>/logs
  --allow-escape-sequences | grep -a "<spec>"`. A skipped spec on a passing shard looks identical
  to a passing one in the checks UI.
- **`String()` on money is a live bug, not a style preference.** `String(3.67647)` emits 5
  decimals against a 6dp contract and produces false divergence banners. Use `.toFixed(6)`.
  This is the woocommerce-pos#1548 lesson; both copies encode it, and the port must keep it.
- **Fee percent basis changed shape on purpose.** The hook read the cart mid-math via
  `getLatest()`; the port takes `cartLineItems` explicitly. Do not reintroduce the read.
- **Line-level values are stored at 6dp, order-level at `dp`.** See the comment at
  `use-calculate-line-item-tax-and-totals.ts:132-134`. Rounding a line to `dp` will look
  correct locally and diverge against the server.
- **R15 ratchet.** Deleting a hook deletes its test file. That needs a `Test-Removal: <why>`
  trailer in a commit message and a re-push.

---

## 7. Do NOT do these

- **Do not promote the `/internal` symbols to the public surface** to make the imports "legal".
  `packages/order-math/src/index.ts` is a deliberately narrow surface pinned byte-for-byte by
  `index.test.ts`. Widening it to avoid a refactor inverts the point of the package.
- **Do not touch these three `/internal` importers — they stay by design**, per the header at
  `order-math/src/internal/index.ts:13-16`: `pos/hooks/coupon-recalculate.ts` (narrows
  structural types to RxDB document types), `pos/hooks/coupon-validation.ts` (injects the
  clock), and `pos/hooks/calculate-order-totals.ts` (declared test seam).
- **Do not fold this into #1472's "delete the shims" checkbox.** The nine MIGRATION SHIM files
  it names are already gone — the header says so. Open a fresh issue carrying the §1/§2
  evidence, or this reads as housekeeping to the next person and gets rushed.
- **Do not delete `settle.oracle.test.ts` by itself, whatever #1472 says.** See §8.2 — widen
  the differential first (task 4 in §5), and read the correction there before assuming any
  fixture covers what its name suggests.

---

## 8. Prerequisite — PR #1509, MERGED (`929a33e678`, 2026-08-23)

Already on `main`, so the headers below are what you will find in the tree. Two header
corrections, no behaviour change, no test removed. Recorded here because they are the headers
you will read for orientation, and because §8.2 carries a correction worth reading before you
trust any fixture's name.

1. **`internal/index.ts` claimed the public index "has no callers yet".** False since #1505.
   Rewritten to describe the surface as it is, name the three consumers that stay by design,
   and state that the per-line tax hooks are a second implementation rather than a settled
   arrangement.

2. **`settle.oracle.test.ts` — retirable, but not by deletion alone.**

   Its premise HAS expired: it models the multi-patch loop in `use-cart-lines.ts`, which #1505
   replaced.

   `settle-cart-differential.test.ts` varies only `pricesIncludeTax` — its `makeConfig`
   hardcodes `taxRoundAtSubtotal: false`, `dp: 2` and non-compound rates. So compound rates,
   `dp = 0`, `taxRoundAtSubtotal` and tombstoned lines are all absent *there*.

   **They are not absent from the package.** Compound → `settle.integration.test.ts` and
   `internal/coupons/compound-tax-priority.test.ts`. `dp = 0` → `cart-line.test.ts`,
   `internal/order-totals.test.ts`, `internal/money/calculate-taxes.test.ts`.
   round-at-subtotal → four suites. Tombstones → `settle.test.ts`'s "tombstone law".

   What is unique to the oracle is only that those dimensions run through `settleCart`'s whole
   composition rather than against the internals individually.

   > **Correction, and a warning.** My first draft of this doc and of PR #1509 claimed deleting
   > the oracle would silently drop the compound-ordering and round-at-subtotal parity defects
   > behind the pre-1.10.0 divergence banners. Review corrected both. #1548's ordering
   > regression has its own fixture — two COMPOUND rates with tied `order: 0` and differing
   > `priority`, the actual trap. The oracle's case 4 has ONE compound rate, distinct `order`
   > values and no `priority`, so it never touched the ordering bug. **If you port case 4
   > expecting ordering coverage you will not get it** — take the fixture from
   > `compound-tax-priority.test.ts` instead.

   Retiring it: port the four config dimensions into the differential (parameterise its
   `makeConfig`), then delete with a `Test-Removal:` trailer. Task 4 in §5.

   **A warning about #1472's scope list generally.** It was written before the cutover landed.
   Of its three remaining boxes, one was already done (the nine shim files), one rested on a
   premise that had expired (this), and one is a real refactor labelled as housekeeping (§1).
   **Verify each box against the tree before working it.**

---

## 9. Verification bar

Per stage, before opening the PR:

```
cd packages/core && npx jest src/screens/main/pos --maxWorkers=2 --coverage=false
cd packages/order-math && npx jest --maxWorkers=2
npx tsc --noEmit -p tsconfig.json          # in each touched package
PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm lint --force   # from the ROOT
```

Then push and let Deploy + E2E run. **Take the PR out of draft** — `test.yml` guards on
`pull_request.draft`, so a green tick on a draft means nothing ran.

**Mutation-check anything you claim is a fix.** Revert the change, confirm the test fails,
restore. A test that passes against the broken code is worth nothing.

---

## 10. Environment notes that will otherwise cost you an hour

- **Always work in a git worktree** (`.claude/worktrees/`), branched from `origin/main`.
- **A fresh worktree's `pnpm install` rewrites `pnpm-lock.yaml`** — it drops the `apps/web`
  importer (submodule not initialised) and de-nests a peer chain. Restore it before committing:
  `git checkout origin/main -- pnpm-lock.yaml`. It nearly shipped in #1508.
- **Three core suites fail to RUN in a fresh worktree** on
  `Cannot find module 'rxdb-premium/plugins/flexsearch'` — licence-gated, needs `RXDB_PREMIUM`
  and network. Environmental, not yours. CI has it.
- Run the lint gate **from the repo root** and **after the last edit**; per-package eslint has a
  different scope from CI's.
- `~/.claude/scripts/cleanup-worktrees.sh --dry-run` before any cleanup.

---

## 11. Context you may want

- **ADR 0032 — WooCommerce owns money, the POS owns intent** (`wcpos/wiki`,
  `architecture/decisions/2026-08-23-money-authority.md`, Accepted). Explains why false
  divergence is now expensive. Note its verified finding: the order aggregate fields are
  `readonly` in WooCommerce's REST schema, so the POS's aggregate has never been settable and
  the server always recalculates from the lines. **The lines are what the POS actually
  asserts** — which is exactly the maths this migration deduplicates.
- `architecture/client/order-money-precision.md` — the divergence comparator and the cashier
  surface.
- #1505 — the settle cutover. Its PR body has the write-path detail.
- #1507 — follow-up: stop pushing the aggregate at all.
