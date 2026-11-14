import { useDocField } from '@wcpos/query';

import { useUISettings } from '../../../contexts/ui-settings';

export type PanelSubject = 'cart' | 'products' | 'shell';

export function usePanelSide(subject: PanelSubject): 'left' | 'right' {
	// The panel side is the CART's setting since #3117 (`pos-cart.position`, `right` by default).
	const { uiSettings } = useUISettings('pos-cart');
	const position = useDocField(uiSettings, (value) => value.position);
	if (subject === 'shell') return 'right';
	// LEDGER.md line 3: cart panels cover products; product panels cover the cart. So a cart
	// subject docks opposite the cart and a products subject docks on the cart's side.
	if (subject === 'cart') return position === 'left' ? 'right' : 'left';
	return position === 'left' ? 'left' : 'right';
}
