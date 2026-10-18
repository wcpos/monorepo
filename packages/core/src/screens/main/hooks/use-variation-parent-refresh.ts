import * as React from 'react';

import { useQueryRuntime, watchVariationParentRefresh } from '@wcpos/query';

/**
 * Keep a variable product in step with its children.
 *
 * A variable product's price range is not a field it owns. The server recomputes
 * it per read from the visible children and injects it as
 * `_woocommerce_pos_variable_prices` (plugin `Sync/Variable_Prices.php`), and
 * blanks the parent's own price fields on the wire; `VariableProductPrice`
 * renders that meta entry. So editing a child's price changes what the parent's
 * row should show while leaving the parent's own record untouched — no pull lane
 * has any reason to fetch it, and the grid keeps rendering the pre-edit range.
 *
 * The repair is bound to the RECORD and to the engine's own acknowledgement,
 * NOT to the promise of one `write()` call, because both of the ways a write
 * reaches the server outlive such a promise:
 *
 *  - an edit made offline (or behind a slow push) is acknowledged whenever it
 *    eventually drains — minutes later, or after a relaunch. A caller waiting on
 *    `awaitWriteOutcome` has given up at its 15s timeout by then.
 *  - an unclaimed queued update that is superseded before it drains is
 *    coalesced into its replacement under a FRESH mutationId
 *    (`recordMutationQueue.ts`: "the intent fields change only during UNCLAIMED
 *    coalescing — and then under a fresh mutationId"). The original receipt can
 *    then never settle, so a price edit followed by, say, a barcode edit would
 *    push the price and refresh nothing.
 *
 * Listening for the acknowledgement of ANY write to that variation survives both:
 * whatever mutation actually lands names the same `recordId`, and it names it
 * whenever it lands.
 *
 * Every acknowledged variation write refreshes the parent, not only a price one.
 * The event carries no field list, and reconstructing one would mean a
 * recordId-keyed table of "this edit touched a price" — in-memory state that a
 * relaunch drops, which is the first failure above all over again. It is also
 * the honest invariant: the parent's SERVED projection is a function of its
 * children (all three price sub-ranges, and Woo's in-stock aggregation), so any
 * child write can move it. The cost is one targeted GET per deliberate,
 * user-initiated variation edit.
 */
export function useVariationParentRefresh(): void {
	const runtime = useQueryRuntime();
	React.useEffect(() => watchVariationParentRefresh(runtime.engine), [runtime]);
}
