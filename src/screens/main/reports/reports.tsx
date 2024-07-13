import * as React from 'react';

import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Gutter from '@wcpos/components/src/gutter';
import { Panel, PanelGroup, PanelResizeHandle } from '@wcpos/components/src/panels';
import Suspense from '@wcpos/components/src/suspense';
import { useQuery } from '@wcpos/query';

import { Chart } from './chart';
import { FilterBar } from './filter-bar';
import { Orders } from './orders';
import { Report } from './report';
import { useAppState } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';
import { useUISettings } from '../contexts/ui-settings';

type OrderDocument = import('@wcpos/database').OrderDocument;

/**
 *
 */
export const Reports = () => {
	const { uiSettings } = useUISettings('orders');
	const theme = useTheme();
	const t = useT();
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
					{ meta_data: { $elemMatch: { key: '_pos_store', value: String(store?.id) } } },
				],
			},
		},
	});

	/**
	 *
	 */
	return (
		<Box style={{ height: '100%' }}>
			<PanelGroup direction="vertical">
				<Panel maxSize={75} defaultSize={40}>
					<FilterBar query={query} />
					<Chart query={query} />
				</Panel>
				<PanelResizeHandle>
					<Gutter direction="horizontal" />
				</PanelResizeHandle>
				<Panel maxSize={75}>
					<PanelGroup direction="horizontal">
						<Panel maxSize={75}>
							<ErrorBoundary>
								<Suspense>
									<Orders query={query} />
								</Suspense>
							</ErrorBoundary>
						</Panel>
						<PanelResizeHandle>
							<Gutter />
						</PanelResizeHandle>
						<Panel maxSize={75}>
							<Report />
						</Panel>
					</PanelGroup>
				</Panel>
			</PanelGroup>
		</Box>
	);
};
