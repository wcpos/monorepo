import { useDocField } from '@wcpos/query';

import { useUISettings } from '../../../../contexts/ui-settings';

export type PanelSubject = 'cart' | 'products' | 'shell';

export function usePanelSide(subject: PanelSubject): 'left' | 'right' {
	const { uiSettings } = useUISettings('pos-products');
	const position = useDocField(uiSettings, (value) => value.position);
	if (subject === 'shell') return 'right';
	// LEDGER.md line 3: cart panels cover products; product panels cover the cart.
	if (subject === 'cart') return position === 'right' ? 'right' : 'left';
	return position === 'right' ? 'left' : 'right';
}
