import * as React from 'react';

import { registerSlotEntry } from '../../../extensions/slots';
import { OpenOrders } from './cart';
import { POSProducts } from './products';

import type { SlotEntryProps } from '../../../extensions/slots';

/**
 * Every first-party POS slot entry, registered at import time.
 *
 * Both POS entry points import this module for its side effect, so the panels exist however
 * the screen was reached. Registration is idempotent by id, so importing it twice is fine.
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
