import * as React from 'react';
import { Platform, ScrollView, View, type ViewInstance } from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { PortalHost } from '@wcpos/components/portal';
import { registerPortalContainer } from '@wcpos/components/lib/portal-container';

import { useTheme } from '../../../contexts/theme';
import { useReportsScope } from './context';
import { DetailPanel } from './panels/panel';
import { Hero } from './hero';
import { PeriodSection } from './cards';
import { ReportsSyncProgress } from './sync-progress';

export function Reports({
	title,
	header,
}: {
	title: React.ReactNode;
	/** The till strip: the page's first row, scrolling with it (owner, 2026-10-18). */
	header?: React.ReactNode;
}) {
	const { bottom } = useSafeAreaInsets();
	const { detail } = useReportsScope(),
		{ screenSize } = useTheme();
	const phonePanel = !!detail && screenSize === 'sm';
	const registerContainer = React.useCallback((node: ViewInstance | null) => {
		registerPortalContainer(
			'reports',
			Platform.OS === 'web' ? (node as unknown as HTMLElement) : null
		);
	}, []);
	return (
		<View
			ref={registerContainer}
			testID="screen-reports"
			className="h-full gap-2"
			style={{ paddingBottom: !phonePanel && bottom !== 0 ? bottom : undefined }}
		>
			{!phonePanel && (
				<ErrorBoundary>
					<ReportsSyncProgress />
				</ErrorBoundary>
			)}
			<View className="min-h-0 flex-1 flex-row">
				<ErrorBoundary>
					{phonePanel ? (
						<DetailPanel key={detail} />
					) : (
						// The page gutter (16) around and between the strip, the hero and the cards.
						<ScrollView className="flex-1" contentContainerClassName="gap-4 p-4">
							{header}
							<Hero title={title} />
							<PeriodSection />
						</ScrollView>
					)}
					{detail && !phonePanel && <DetailPanel key={detail} />}
				</ErrorBoundary>
			</View>
			<PortalHost name="reports" />
		</View>
	);
}
