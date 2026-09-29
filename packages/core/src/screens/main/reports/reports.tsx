import * as React from 'react';
import { ScrollView, View } from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Panel, PanelGroup, PanelResizeHandle } from '@wcpos/components/panels';
import { VStack } from '@wcpos/components/vstack';
import { useTheme } from '@wcpos/core/contexts/theme';

import { Hero } from './hero';
import { Orders } from './orders';
import { Report } from './report';
import { ReportsSyncProgress } from './sync-progress';

/**
 *
 */
export function Reports({ title }: { title: React.ReactNode }) {
	const { screenSize } = useTheme();
	const { bottom } = useSafeAreaInsets();

	/**
	 *
	 */
	return (
		<VStack
			testID="screen-reports"
			className="h-full"
			style={{ paddingBottom: bottom !== 0 ? bottom : undefined }}
		>
			<ErrorBoundary>
				<ReportsSyncProgress />
			</ErrorBoundary>
			<View className="flex-1">
				<ErrorBoundary>
					{screenSize === 'sm' ? (
						<ScrollView contentContainerClassName="gap-3">
							<Hero title={title} />
							<View className="h-96 pr-2">
								<Orders />
							</View>
							<View className="h-96 pl-2">
								<Report />
							</View>
						</ScrollView>
					) : (
						// The hero takes its natural height; the orders and the summary share the rest,
						// and a short viewport scrolls the page rather than clipping the chart.
						<ScrollView
							className="h-full w-full"
							contentContainerClassName="min-h-full gap-3 px-2"
							testID="reports-sales-scroll"
						>
							<Hero title={title} />
							<View className="h-[520px] flex-1">
								<PanelGroup direction="horizontal">
									<Panel>
										<Orders />
									</Panel>
									<PanelResizeHandle />
									<Panel>
										<Report />
									</Panel>
								</PanelGroup>
							</View>
						</ScrollView>
					)}
				</ErrorBoundary>
			</View>
		</VStack>
	);
}
