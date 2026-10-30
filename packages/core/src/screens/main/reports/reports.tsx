import * as React from 'react';
import { Platform, ScrollView, View, type ViewInstance } from 'react-native';

import { useEdgeInsets } from '@wcpos/components/edge-surface';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { PortalHost } from '@wcpos/components/portal';
import { registerPortalContainer } from '@wcpos/components/lib/portal-container';
import { useIsPhone } from '@wcpos/components/lib/device';
import { cn } from '@wcpos/components/lib/utils';
import { useGround } from '@wcpos/components/lib/ground';

import { useReportsScope } from './context';
import { DetailPanel } from './panels/panel';
import { Hero, SalesScope } from './hero';
import { PeriodSection } from './cards';
import { ReportsSyncProgress } from './sync-progress';

const BOTTOM = ['bottom'] as const;

export function Reports({
	date,
	header,
}: {
	date: React.ReactNode;
	/** The till strip: the page's first row, scrolling with it (owner, 2026-10-18). */
	header?: React.ReactNode;
}) {
	const bottomInset = useEdgeInsets(BOTTOM);
	const ground = useGround();
	const { detail } = useReportsScope(),
		phone = useIsPhone();
	const phonePanel = !!detail && phone;
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
			// A phone panel in the page's place pads the home indicator in its own colour.
			style={phonePanel ? undefined : bottomInset}
		>
			{!phonePanel && (
				<ErrorBoundary>
					<ReportsSyncProgress />
				</ErrorBoundary>
			)}
			<View className="min-h-0 flex-1 flex-row">
				{phonePanel ? (
					<ErrorBoundary>
						<DetailPanel key={detail} />
					</ErrorBoundary>
				) : (
					// The page gutter around and between the strip, the hero and the cards.
					<ScrollView className="flex-1" contentContainerClassName={cn(ground.gap, ground.p)}>
						{/* The strip stays outside the report's boundary: it is the only way into
						    Closures, so a failed hero or card must not take it down (Codex, #2720). */}
						{header}
						<SalesScope date={date} settled />
						<ErrorBoundary>
							<Hero />
							<PeriodSection />
						</ErrorBoundary>
					</ScrollView>
				)}
				{detail && !phonePanel && (
					<ErrorBoundary>
						<DetailPanel key={detail} />
					</ErrorBoundary>
				)}
			</View>
			<PortalHost name="reports" />
		</View>
	);
}
