import * as React from 'react';

import { useDocField } from '@wcpos/query';

import { useBreakpoint } from '../../../../../contexts/theme/use-breakpoint';
import { useUISettings } from '../../../contexts/ui-settings';

export type POSOverlaySide = 'left' | 'right' | 'bottom';

export function oppositeOverlaySide(side: POSOverlaySide): POSOverlaySide {
	return side === 'bottom' ? 'bottom' : side === 'left' ? 'right' : 'left';
}

const POSOverlaySideContext = React.createContext<POSOverlaySide>('right');

export function POSOverlaySideProvider({ children }: { children: React.ReactNode }) {
	const { uiSettings } = useUISettings('pos-products');
	const position = useDocField(uiSettings, (value) => value.position);
	const screenSize = useBreakpoint();
	const side = React.useMemo<POSOverlaySide>(
		() => (screenSize === 'sm' ? 'bottom' : position === 'right' ? 'right' : 'left'),
		[screenSize, position]
	);

	return <POSOverlaySideContext.Provider value={side}>{children}</POSOverlaySideContext.Provider>;
}

export function usePOSOverlaySide(): POSOverlaySide {
	return React.useContext(POSOverlaySideContext);
}
