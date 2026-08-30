import * as React from 'react';
import type { LayoutChangeEvent } from 'react-native';

import { fitPageSize } from './fit-page-size';

type Layout = { width: number; height: number };

export function useFitPageSize(
	setPageSize: (pageSize: number) => void,
	viewMode: 'grid' | 'table',
	gridColumns: number | undefined
): (event: LayoutChangeEvent) => void {
	const layoutRef = React.useRef<Layout | null>(null);
	const lastPageSizeRef = React.useRef<number | null>(null);

	const applyFit = React.useCallback(
		(layout: Layout) => {
			const pageSize = fitPageSize({ ...layout, viewMode, gridColumns });
			if (pageSize === lastPageSizeRef.current) return;
			lastPageSizeRef.current = pageSize;
			setPageSize(pageSize);
		},
		[gridColumns, setPageSize, viewMode]
	);

	const handleLayout = React.useCallback(
		(event: LayoutChangeEvent) => {
			const { width, height } = event.nativeEvent.layout;
			// A hidden panel (small screens keep Products mounted under display:none while Cart is
			// active) measures 0x0. That is not a fit: keep the last real measurement so the page
			// size never falls back to the floor and re-opens short on the next search reset.
			if (width <= 0 || height <= 0) return;
			layoutRef.current = { width, height };
			applyFit(layoutRef.current);
		},
		[applyFit]
	);

	// Display settings do not trigger onLayout, so re-fit their last measured panel explicitly.
	React.useEffect(() => {
		if (layoutRef.current) applyFit(layoutRef.current);
	}, [applyFit]);

	return handleLayout;
}
