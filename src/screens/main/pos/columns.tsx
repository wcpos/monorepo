import * as React from 'react';

import { ErrorBoundary } from '@wcpos/tailwind/src/error-boundary';
import { PanelGroup, Panel, PanelResizeHandle } from '@wcpos/tailwind/src/panels';
import { Suspense } from '@wcpos/tailwind/src/suspense';

import OpenOrders from './cart';
import Products from './products';
import { useUISettings } from '../contexts/ui-settings';

/**
 *
 */
const ResizableColumns = () => {
	const { uiSettings, patchUI } = useUISettings('pos-products');

	/**
	 *
	 */
	return (
		<PanelGroup defaultSize={uiSettings.width} onLayout={(val) => console.log(val)}>
			<Panel>
				<Suspense>
					<ErrorBoundary>
						<Products isColumn />
					</ErrorBoundary>
				</Suspense>
			</Panel>
			<PanelResizeHandle />
			<Panel>
				<Suspense>
					<ErrorBoundary>
						<OpenOrders isColumn />
					</ErrorBoundary>
				</Suspense>
			</Panel>
		</PanelGroup>
	);
};

export default ResizableColumns;
