import * as React from 'react';
import { View, useWindowDimensions } from 'react-native';

import { useObservableSuspense } from 'observable-hooks';

import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import { Panel, PanelGroup, PanelResizeHandle } from '@wcpos/components/src/panels';
import { VStack } from '@wcpos/components/src/vstack';
import type { OrderDocument } from '@wcpos/database';

import { Chart } from './chart';
import { FilterBar } from './filter-bar';
import { Orders } from './orders';
import { Report } from './report';

import type { RowSelectionState } from '@tanstack/react-table';

/**
 *
 */
export const Reports = ({ query }) => {
	const dimensions = useWindowDimensions();
	const result = useObservableSuspense(query.resource);
	const [unselectedRowIds, setUnselectedRowIds] = React.useState<RowSelectionState>({});

	/**
	 *
	 */
	const allOrders = React.useMemo(
		() => result.hits.map((hit) => hit.document as OrderDocument),
		[result.hits]
	);

	/**
	 * Remove unselectedRowIds from orders
	 */
	const orders = React.useMemo(() => {
		if (Object.keys(unselectedRowIds).length === 0) {
			return allOrders;
		}

		return allOrders.filter((order) => !unselectedRowIds[order.uuid]);
	}, [allOrders, unselectedRowIds]);

	/**
	 *
	 */
	return (
		<VStack className="h-full">
			<ErrorBoundary>
				<FilterBar query={query} />
			</ErrorBoundary>
			<View className="flex-1">
				<ErrorBoundary>
					{dimensions.width >= 640 ? (
						<PanelGroup direction="vertical">
							<Panel defaultSize={40}>
								<Chart orders={orders} />
							</Panel>
							<PanelResizeHandle />
							<Panel>
								<PanelGroup direction="horizontal">
									<Panel>
										<Orders
											query={query}
											orders={allOrders}
											unselectedRowIds={unselectedRowIds}
											setUnselectedRowIds={setUnselectedRowIds}
										/>
									</Panel>
									<PanelResizeHandle />
									<Panel>
										<Report orders={orders} query={query} />
									</Panel>
								</PanelGroup>
							</Panel>
						</PanelGroup>
					) : (
						<VStack className="h-full gap-0">
							<View className="flex-1 pr-2">
								<Orders
									query={query}
									orders={allOrders}
									unselectedRowIds={unselectedRowIds}
									setUnselectedRowIds={setUnselectedRowIds}
								/>
							</View>
							<View className="flex-1 pl-2">
								<Report orders={orders} query={query} />
							</View>
						</VStack>
					)}
				</ErrorBoundary>
			</View>
		</VStack>
	);
};
