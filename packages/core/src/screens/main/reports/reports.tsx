import * as React from 'react';
import { View, useWindowDimensions } from 'react-native';

import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import { Panel, PanelGroup, PanelResizeHandle } from '@wcpos/components/src/panels';
import { VStack } from '@wcpos/components/src/vstack';

import { Chart } from './chart';
import { FilterBar } from './filter-bar';
import { Orders } from './orders';
import { Report } from './report';

/**
 *
 */
export const Reports = () => {
	const dimensions = useWindowDimensions();

	/**
	 *
	 */
	return (
		<VStack className="h-full">
			<ErrorBoundary>
				<FilterBar />
			</ErrorBoundary>
			<View className="flex-1">
				<ErrorBoundary>
					{dimensions.width >= 640 ? (
						<PanelGroup direction="vertical">
							<Panel defaultSize={40}>
								<Chart />
							</Panel>
							<PanelResizeHandle />
							<Panel>
								<PanelGroup direction="horizontal">
									<Panel>
										<Orders />
									</Panel>
									<PanelResizeHandle />
									<Panel>
										<Report />
									</Panel>
								</PanelGroup>
							</Panel>
						</PanelGroup>
					) : (
						<VStack className="h-full gap-0">
							<View className="flex-1 pr-2">
								<Orders />
							</View>
							<View className="flex-1 pl-2">
								<Report />
							</View>
						</VStack>
					)}
				</ErrorBoundary>
			</View>
		</VStack>
	);
};
