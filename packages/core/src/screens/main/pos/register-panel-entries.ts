import * as React from 'react';

import { registerSlotEntry } from '../../../extensions/slots';
import { OpenOrders } from './cart';
import { POSProducts } from './products';

import type { SlotEntryProps } from '../../../extensions/slots';

/**
 * The `pos.columns.panel` entries, registered at import time.
 *
 * Imported for its side effect by the columns route — the only host of that slot — and by
 * nothing else. Registrations live beside the host that renders them, never beside the
 * component that gets registered, so no module ends up importing its own importer.
 * Registration is idempotent by id, so importing it twice is fine.
 *
 * The panel entries are thin wrappers, not ports: `POSProducts` and `OpenOrders` keep
 * importing app internals directly. The contract governs the SLOT boundary — what crosses
 * as `data`/`api` — not what a first-party component may reach for inside itself.
 */
function ProductsPanelEntry(_props: SlotEntryProps<'pos.columns.panel'>) {
	return React.createElement(POSProducts, { isColumn: true });
}

function CartPanelEntry(_props: SlotEntryProps<'pos.columns.panel'>) {
	return React.createElement(OpenOrders, { isColumn: true });
}

registerSlotEntry({
	id: 'products',
	slot: 'pos.columns.panel',
	order: 10,
	title: 'Products',
	capabilities: [],
	component: ProductsPanelEntry,
});

registerSlotEntry({
	id: 'cart',
	slot: 'pos.columns.panel',
	order: 20,
	title: 'Cart',
	capabilities: [],
	component: CartPanelEntry,
});
