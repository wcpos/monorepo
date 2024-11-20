import * as React from 'react';

import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import { PanelGroup, Panel, PanelResizeHandle } from '@wcpos/components/src/panels';
import { Suspense } from '@wcpos/components/src/suspense';

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
		<PanelGroup onResize={({ width }) => patchUI({ width })}>
			<Panel defaultSize={uiSettings.width}>
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
