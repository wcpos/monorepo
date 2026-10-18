import * as React from 'react';
import { ScrollView, View } from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@wcpos/components/card';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Suspense } from '@wcpos/components/suspense';
import { Text } from '@wcpos/components/text';

/** The page paddings around the card; the phone keeps its 16 px gutter. */
const PAGE_PADDING = 'px-4 py-5 md:px-8 md:py-6';

export type AreaPageMode = 'scroll' | 'fill';

/**
 * A page of a navigation area (Settings, Store health): ONE card on the page ground, its
 * heading inside as the first element, a hairline rule, then the body (owner, 2026-10-18).
 * One reading width (896, centred) for both areas.
 *
 * `scroll` (default): the page scrolls as a whole and the card grows with its content.
 * `fill`: the card fills the column's height and the body is a flex column, so a
 * virtualised list inside can own its scrolling (Logs).
 */
export function AreaPage({
	title,
	description,
	testID,
	mode = 'scroll',
	children,
}: {
	title: string;
	description?: string;
	testID: string;
	mode?: AreaPageMode;
	children: React.ReactNode;
}) {
	const insets = useSafeAreaInsets();
	const heading = (
		<View className="gap-0.5 px-5 pt-4.5 pb-3.5">
			<Text role="heading" aria-level={1} className="text-xl font-semibold">
				{title}
			</Text>
			{!!description && <Text className="text-muted-foreground text-sm">{description}</Text>}
		</View>
	);
	const body = (
		<ErrorBoundary>
			<Suspense>{children}</Suspense>
		</ErrorBoundary>
	);

	if (mode === 'fill') {
		return (
			<View
				testID={testID}
				className="min-h-0 flex-1"
				// The last control on a page sits above the home indicator, never on it.
				style={{ paddingBottom: insets.bottom }}
			>
				<View className={`min-h-0 flex-1 ${PAGE_PADDING}`}>
					<Card className="mx-auto min-h-0 w-full max-w-4xl flex-1 overflow-hidden">
						{heading}
						<View className="border-border border-t-hairline min-h-0 flex-1 p-5">{body}</View>
					</Card>
				</View>
			</View>
		);
	}

	return (
		<ScrollView
			testID={testID}
			className="flex-1"
			// The last control on a page sits above the home indicator, never on it.
			contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
		>
			<View className={`mx-auto w-full max-w-4xl ${PAGE_PADDING}`}>
				<Card className="overflow-hidden">
					{heading}
					<View className="border-border border-t-hairline p-5">{body}</View>
				</Card>
			</View>
		</ScrollView>
	);
}
