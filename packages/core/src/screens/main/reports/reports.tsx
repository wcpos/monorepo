import * as React from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';

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
// Below this height (a phone in landscape, a squeezed desktop window) the hero alone would take
// the page, so the page scrolls and the panes keep a fixed height, as on a phone.
const SHORT_VIEWPORT_HEIGHT = 640;

export function Reports({ title }: { title: React.ReactNode }) {
	const { screenSize } = useTheme();
	const { bottom } = useSafeAreaInsets();
	const short = useWindowDimensions().height < SHORT_VIEWPORT_HEIGHT;

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
						// The phone page scrolls; the two panes inside it scroll on the same axis, so
						// they opt into nested scrolling (Android hands them their drags).
						<ScrollView contentContainerClassName="gap-3">
							<Hero title={title} />
							<View className="h-96 pr-2">
								<Orders nestedScrollEnabled />
							</View>
							<View className="h-96 pl-2">
								<Report nestedScrollEnabled />
							</View>
						</ScrollView>
					) : short ? (
						// A short viewport: the page scrolls, the panes keep a fixed height and opt
						// into nested scrolling (as on a phone).
						<ScrollView contentContainerClassName="gap-3 px-2">
							<Hero title={title} />
							<View className="h-96">
								<PanelGroup direction="horizontal">
									<Panel>
										<Orders nestedScrollEnabled />
									</Panel>
									<PanelResizeHandle />
									<Panel>
										<Report nestedScrollEnabled />
									</Panel>
								</PanelGroup>
							</View>
						</ScrollView>
					) : (
						// The hero takes its natural height; the orders and the summary share the rest
						// and scroll themselves. No page scroll around lists that scroll on the same
						// axis: on Android the outer one would take their drags.
						<View className="h-full w-full gap-3 px-2">
							<Hero title={title} />
							<View className="min-h-0 flex-1">
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
						</View>
					)}
				</ErrorBoundary>
			</View>
		</VStack>
	);
}
