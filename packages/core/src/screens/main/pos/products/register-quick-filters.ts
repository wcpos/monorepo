import { QuickFiltersBar } from './quick-filters-bar';
import { registerSlotEntry } from '../../../../extensions/slots';

/**
 * The `pos.products.filter-bar.item` entries, registered at import time.
 *
 * The POS products screen imports this for its side effect. It deliberately reaches only
 * downwards — to the entry component and the registry — so the screen that hosts the slot
 * never becomes a dependency of the module that fills it.
 */
registerSlotEntry({
	id: 'quick-filters',
	slot: 'pos.products.filter-bar.item',
	order: 10,
	title: 'Quick filters',
	capabilities: [],
	component: QuickFiltersBar,
});
