import * as React from 'react';
import { View, useWindowDimensions } from 'react-native';

import { useObservableSuspense } from 'observable-hooks';

import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import { Panel, PanelGroup, PanelResizeHandle } from '@wcpos/components/src/panels';
import { VStack } from '@wcpos/components/src/vstack';

import { Chart } from './chart';
import { FilterBar } from './filter-bar';
import { Orders } from './orders';
import { Report } from './report';

type OrderDocument = import('@wcpos/database').OrderDocument;

/**
 *
 */
export const Reports = ({ query }) => {
	const dimensions = useWindowDimensions();
	const result = useObservableSuspense(query.resource);
	const orders = result.hits.map((hit) => hit.document as OrderDocument);

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
										<Orders query={query} />
									</Panel>
									<PanelResizeHandle />
									<Panel>
										<Report orders={orders} />
									</Panel>
								</PanelGroup>
							</Panel>
						</PanelGroup>
					) : (
						<VStack className="h-full gap-0">
							<View className="flex-1 pr-2">
								<Orders query={query} />
							</View>
							<View className="flex-1 pl-2">
								<Report orders={orders} />
							</View>
						</VStack>
					)}
				</ErrorBoundary>
			</View>
		</VStack>
	);
};
