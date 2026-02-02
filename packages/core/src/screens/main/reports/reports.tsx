import * as React from 'react';
import { View } from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Panel, PanelGroup, PanelResizeHandle } from '@wcpos/components/panels';
import { VStack } from '@wcpos/components/vstack';
import { useTheme } from '@wcpos/core/contexts/theme';

import { Chart } from './chart';
import { FilterBar } from './filter-bar';
import { Orders } from './orders';
import { Report } from './report';

/**
 *
 */
export const Reports = () => {
	const { screenSize } = useTheme();
	const { bottom } = useSafeAreaInsets();

	/**
	 *
	 */
	return (
		<VStack testID="screen-reports" className="h-full" style={{ paddingBottom: bottom !== 0 ? bottom : undefined }}>
			<ErrorBoundary>
				<FilterBar />
			</ErrorBoundary>
			<View className="flex-1">
				<ErrorBoundary>
					{screenSize === 'sm' ? (
						<VStack className="h-full gap-0">
							<View className="flex-1 pr-2">
								<Orders />
							</View>
							<View className="flex-1 pl-2">
								<Report />
							</View>
						</VStack>
					) : (
						<PanelGroup direction="vertical">
							<Panel defaultSize={40}>
								<View className="h-full w-full px-2">
									<Chart />
								</View>
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
					)}
				</ErrorBoundary>
			</View>
		</VStack>
	);
};
