import * as React from 'react';
import { ScrollView, View } from 'react-native';

import { Card } from '@wcpos/components/card';
import { EdgeSurface, useEdgeInsets } from '@wcpos/components/edge-surface';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Suspense } from '@wcpos/components/suspense';
import { Text } from '@wcpos/components/text';
import { useGround } from '@wcpos/components/lib/ground';

export type AreaPageMode = 'scroll' | 'fill';

const BOTTOM = ['bottom'] as const;

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
	// The last control on a page sits above the home indicator, never on it.
	const bottomInset = useEdgeInsets(BOTTOM);
	// The ground's gutter around the card (`useGround`), on every side: the same gutter the list
	// pages give their search, chips and card, 16 at a phone's screen edge. The 20/24 verticals
	// and the 32 on `md` that preceded it were this page's own numbers, off the scale. The card's
	// own body keeps its 16 (inside a surface).
	const padding = useGround().p;
	// The title alone: the heading carries neither the bell nor the avatar (Paul, 2026-10-30).
	const heading = (
		<View className="gap-0.5 px-4 pt-4 pb-3">
			<Text role="heading" aria-level={1} className="text-xl font-semibold">
				{title}
			</Text>
			{!!description && <Text variant="help">{description}</Text>}
		</View>
	);
	const body = (
		<ErrorBoundary>
			<Suspense>{children}</Suspense>
		</ErrorBoundary>
	);

	if (mode === 'fill') {
		return (
			<EdgeSurface testID={testID} edges={BOTTOM} className="min-h-0 flex-1">
				<View className={`min-h-0 flex-1 ${padding}`}>
					<Card className="mx-auto min-h-0 w-full max-w-4xl flex-1 overflow-hidden">
						{heading}
						<View className="border-border border-t-hairline min-h-0 flex-1 p-4">{body}</View>
					</Card>
				</View>
			</EdgeSurface>
		);
	}

	return (
		<ScrollView
			testID={testID}
			className="flex-1"
			// The page scrolls under the home indicator; the gutter under the card is the page
			// padding's, so only the inset is added here.
			contentContainerStyle={bottomInset}
		>
			<View className={`mx-auto w-full max-w-4xl ${padding}`}>
				<Card className="overflow-hidden">
					{heading}
					<View className="border-border border-t-hairline p-4">{body}</View>
				</Card>
			</View>
		</ScrollView>
	);
}
