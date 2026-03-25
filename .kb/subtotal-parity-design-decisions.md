# Subtotal Parity: Use POS Price as Subtotal to Match WC Sale Price Behavior

**Issue:** https://github.com/wcpos/monorepo/issues/231
**Date:** 2026-03-25
**Status:** Approved

## Problem

The POS app sends `subtotal = regular_price * qty` for line items, but WooCommerce uses `subtotal = active_price * qty` (sale price when on sale). This means `discount_total` in POS includes both POS price overrides AND coupon discounts, whereas WC only includes coupon discounts.

WC's own docstring confirms: *"If sale price is set on an item, the subtotal will include this sale discount. E.g. a product with a regular price of $100 bought at a 50% discount will represent $50 of the subtotal for the order."*

The server-side WCPOS plugin had a fragile ~280-line `get_subtotal()` filter mechanism to work around this during `recalculate_coupons()`. Free plugin PR #686 removes this mechanism entirely — instead, the client sends `subtotal = POS price`, and no server-side filtering is needed.

## Coordination Requirement

This client change **must deploy together** with free plugin PR https://github.com/wcpos/woocommerce-pos/pull/686 (removes server-side `get_subtotal()` filter). Old client + new server or vice versa would produce incorrect results.

## Design

### Change 1: Subtotal calculation

**File:** `packages/core/src/screens/main/pos/hooks/use-calculate-line-item-tax-and-totals.ts`

Change line 74 from:
```typescript
const subtotal = regular_price * quantity;
```
to:
```typescript
const subtotal = price * quantity;
```

This makes `subtotal === total` when no coupons are applied (regardless of POS price override). The `regular_price` from `getLineItemData()` is still extracted — it's just no longer used for the subtotal calculation.

**Downstream effects:**
- `calculateOrderTotals()` computes `discount_total = subtotal - total` → now only reflects coupon discounts
- `discount_tax` similarly shrinks to coupon-only tax difference
- All existing coupon math continues to work because coupons reduce `total` below `subtotal`

### Change 2: Simplify coupon-recalculate reset step

**File:** `packages/core/src/screens/main/pos/hooks/coupon-recalculate.ts`

The reset step (lines 87-140) currently has two paths:
1. **POS data path** (lines 88-128): Reads `posData.price`, computes `posTotal = parsedPosPrice * qty`, derives ex-tax total and per-rate taxes using ratio math from `subtotal`/`subtotal_tax`
2. **No POS data fallback** (lines 131-139): Simply sets `total = subtotal`, `total_tax = subtotal_tax`

After Change 1, `subtotal` already equals `price * qty` (ex-tax), so the fallback path is correct for all cases. The POS data path is redundant.

**Action:** Collapse the reset step to always use `total = subtotal` (the current fallback path). Remove the POS-data-specific ratio logic.

**What stays unchanged:**
- `isLineItemOnSale()` — still needed for coupon `exclude_sale_items` checks (POS-discounted items should still be treated as "on sale" even though the discount no longer shows in subtotal)
- `buildCouponLineItems()` reading `posData.price` — needs per-unit precision for coupon base calculation; `subtotal / qty` would introduce rounding errors

### Change 3: POS discount display in cart

**File:** `packages/core/src/screens/main/pos/cart/totals.tsx`

Currently derives POS discount from order-level fields:
```typescript
const saleDiscountNumber = discountTotalNumber - couponTotalNumber;
```

After Change 1, `discount_total` only contains coupon discounts, so `saleDiscountNumber` will always be ~0.

**Action:** Compute POS discount from `_woocommerce_pos_data` meta by iterating line items:
```typescript
// Per line item where regular_price > price:
const priceDiff = (regularPrice - price) * qty; // in original tax basis
if (pricesIncludeTax) {
  const taxRate = subtotal > 0 ? subtotalTax / subtotal : 0; // effective rate from stored values
  const exTax = taxRate > 0 ? priceDiff / (1 + taxRate) : priceDiff;
  posDiscountExTax += exTax;
  posDiscountTax += priceDiff - exTax;
} else {
  const taxRate = subtotal > 0 ? subtotalTax / subtotal : 0;
  posDiscountExTax += priceDiff;
  posDiscountTax += priceDiff * taxRate;
}
```

Display follows the same `inclOrExcl` pattern as other cart rows:
```typescript
const displayPosDiscount = inclOrExcl === 'incl'
  ? posDiscountExTax + posDiscountTax
  : posDiscountExTax;
```

This is a display-only value (never sent to the server). The tax ratio approach reuses the tax engine's already-computed values. Minor rounding imprecision is acceptable.

### Change 4: Test updates

| Test file | Changes needed |
|-----------|---------------|
| `calculate-order-totals.test.ts` | Update discount assertions to reflect coupon-only semantics |
| `coupon-recalculate.test.ts` | Update fixtures (subtotal = POS price), update reset step tests for simplified path |
| `utils.test.ts` | No changes expected — `extractLineItemData` still returns `regular_price` |

No new test files needed.

## Files Changed Summary

| File | Change |
|------|--------|
| `use-calculate-line-item-tax-and-totals.ts` | `subtotal = price * quantity` instead of `regular_price * quantity` |
| `coupon-recalculate.ts` | Remove POS-data-specific reset path, keep only `total = subtotal` path |
| `totals.tsx` | POS discount computed from `_woocommerce_pos_data` meta with `inclOrExcl` parity |
| `calculate-order-totals.test.ts` | Update discount assertions |
| `coupon-recalculate.test.ts` | Update fixtures and reset step tests |

## What Doesn't Change

- `extractLineItemData` / `utils.ts` — still returns `regular_price`
- `calculateOrderTotals` — `discount_total = subtotal - total` logic unchanged, just produces smaller numbers
- `buildCouponLineItems` in coupon-recalculate — still reads `posData.price` for per-unit precision
- `isLineItemOnSale` — still needed for coupon exclusion checks

## Out of Scope

The 7 remaining $0.01 mismatches on compound-only rate configurations (local store 153) are a separate rounding issue to track independently.

## Design Decisions & Alternatives

### Decision 1: POS discount display source

**Chosen:** Source from `_woocommerce_pos_data` meta (Option B)

**Rejected:**
- **Option A — Let the row disappear:** UX regression, cashiers lose visibility into POS price overrides
- **Option C — Strikethrough per line item:** Bigger change, separate concern

### Decision 2: Tax handling for POS discount display

**Chosen:** Tax ratio from stored line item values with strict `inclOrExcl` parity

**Rejected:**
- **Skip inclOrExcl:** Simpler, but numbers wouldn't align visually with other cart rows
- **Full tax recalculation via `calculateTaxesFromValue`:** Most precise, but heavy for display-only value

### Decision 3: Coupon-recalculate simplification scope

**Chosen:** Simplify in same PR (Option A)

**Rejected:**
- **Option B — Separate follow-up:** Less risk but leaves dead code and confusing comments

### Key Principle: `_woocommerce_pos_data` is authoritative for per-unit prices

Line item `subtotal` and `total` are `qty * price` after tax extraction and rounding to 6dp. Dividing them back by qty risks float drift. Always use `posData.price` and `posData.regular_price` when per-unit precision is needed.
