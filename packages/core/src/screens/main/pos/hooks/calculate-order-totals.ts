/**
 * Test seam for the order-totals calculation.
 *
 * `calculateOrderTotals` lives in `@wcpos/order-math/internal`. This one-line
 * module exists so a test can substitute exactly that function —
 * `use-cart-lines.test.tsx` and `use-order-totals.test.tsx` both
 * `jest.mock('./calculate-order-totals', …)`. Importing it from the package
 * barrel directly would force those suites to mock the whole `/internal`
 * surface, taking every other symbol they need down with it.
 *
 * Keep it. It is not a migration shim.
 */
export { calculateOrderTotals } from '@wcpos/order-math/internal';
