import * as React from 'react';

import { registerSlotEntry, useSlotValue } from '../../../../extensions/slots';
import { OpenOrderTabs } from './v2/tabs';

import type { SlotEntryProps } from '../../../../extensions/slots';

function OpenOrdersEntry({ data }: SlotEntryProps<'pos.cart.bar'>) {
	return React.createElement(OpenOrderTabs, { position: useSlotValue(data).position });
}

registerSlotEntry({
	id: 'open-orders',
	slot: 'pos.cart.bar',
	order: 10,
	title: 'Open orders',
	capabilities: [],
	component: OpenOrdersEntry,
});
