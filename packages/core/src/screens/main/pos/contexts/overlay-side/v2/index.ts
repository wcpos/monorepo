import { useDocField } from '@wcpos/query';

import { useUISettings } from '../../../../contexts/ui-settings';

export type PanelSubject = 'cart' | 'products' | 'shell';

export function usePanelSide(subject: PanelSubject): 'left' | 'right' {
	const { uiSettings } = useUISettings('pos-products');
	const position = useDocField(uiSettings, (value) => value.position);
	if (subject === 'shell') return 'right';
	if (subject === 'cart') return position === 'right' ? 'left' : 'right';
	return position === 'right' ? 'right' : 'left';
}
