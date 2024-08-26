import * as React from 'react';

import { useQuery } from '@wcpos/query';
import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import { Panel, PanelGroup, PanelResizeHandle } from '@wcpos/components/src/panels';
import { Suspense } from '@wcpos/components/src/suspense';

import { Chart } from './chart';
import { FilterBar } from './filter-bar';
import { Orders } from './orders';
import { Report } from './report';
import { useAppState } from '../../../contexts/app-state';
import { useUISettings } from '../contexts/ui-settings';

type OrderDocument = import('@wcpos/database').OrderDocument;

/**
 *
 */
export const Reports = () => {
	const { uiSettings } = useUISettings('orders');
	const { wpCredentials, store } = useAppState();

	/**
	 *
	 */
	const query = useQuery({
		queryKeys: ['orders', 'reports'],
		collectionName: 'orders',
		initialParams: {
			sortBy: uiSettings.sortBy,
			sortDirection: uiSettings.sortDirection,
			selector: {
				$and: [
					{ status: 'completed' },
					{ meta_data: { $elemMatch: { key: '_pos_user', value: String(wpCredentials?.id) } } },
					// { meta_data: { $elemMatch: { key: '_pos_store', value: String(store?.id) } } },
				],
			},
		},
	});

	/**
	 *
	 */
	return (
		<PanelGroup direction="vertical" onLayout={console.log}>
			<Panel defaultSize={40}>
				<FilterBar query={query} />
				<Chart query={query} />
			</Panel>
			<PanelResizeHandle />
			<Panel>
				<PanelGroup direction="horizontal" onLayout={console.log}>
					<Panel>
						<ErrorBoundary>
							<Suspense>
								<Orders query={query} />
							</Suspense>
						</ErrorBoundary>
					</Panel>
					<PanelResizeHandle />
					<Panel>
						<Report />
					</Panel>
				</PanelGroup>
			</Panel>
		</PanelGroup>
	);
};
