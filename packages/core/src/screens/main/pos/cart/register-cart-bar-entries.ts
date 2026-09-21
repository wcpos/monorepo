import * as React from 'react';

import { registerSlotEntry } from '../../../../extensions/slots';
import { OpenOrderTabs } from './tabs';

import type { SlotEntryProps } from '../../../../extensions/slots';

function OpenOrdersEntry(_props: SlotEntryProps<'pos.cart.bar'>) {
	return React.createElement(OpenOrderTabs);
}

registerSlotEntry({
	id: 'open-orders',
	slot: 'pos.cart.bar',
	order: 10,
	title: 'Open orders',
	capabilities: [],
	component: OpenOrdersEntry,
});
