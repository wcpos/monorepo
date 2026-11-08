import * as React from 'react';

import type { TenderLineId } from '../../checkout/tender/tender-state';

/** The units each line's live payments covered, with their methods (`paidUnitsByLine`). */
export type PaidUnits = Record<TenderLineId, { units: number; methods: string[] }>;

/**
 * The cart table's read-only mode (checkout and receipt). Each cell renders what its input
 * shows, as text, and nothing on a row is pressable but the split picker's stepper and name:
 * the stilled cart is the same table with the same columns, not a copy of it (decision 9,
 * board §6). `picker` is there while the Split chip is on; both maps use `readOnlyLineKey`.
 */
export interface CartTableReadOnly {
	paid?: PaidUnits;
	picker?: {
		picked: Record<TenderLineId, number>;
		paid: PaidUnits;
		unitMinor: (key: TenderLineId, units: number) => number;
		format: (minor: number) => string;
		pick: (key: TenderLineId, units: number) => void;
	};
}

const CartTableReadOnlyContext = React.createContext<CartTableReadOnly | null>(null);

export const CartTableReadOnlyProvider = CartTableReadOnlyContext.Provider;

/** `null` while the table is the editable cart. */
export function useCartTableReadOnly() {
	return React.useContext(CartTableReadOnlyContext);
}

/** A line's key for `paid`, `picker` and the testIDs: the POS uuid, else the server line id. */
export function readOnlyLineKey(uuid: string, item: { id?: number | null }) {
	return uuid || String(item.id ?? '');
}

/**
 * The testID the checkout ledger put on a line's quantity, price and total, kept on the
 * read-only cells so E2E and unit selectors survive the ledger's removal.
 */
export function readOnlyTestID(part: 'qty' | 'price' | 'total', uuid: string) {
	return `checkout-ledger-${part}-${uuid}`;
}
