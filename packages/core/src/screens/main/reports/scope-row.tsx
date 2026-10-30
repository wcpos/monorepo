import * as React from 'react';
import { ScrollView, View } from 'react-native';

import { useIsPhone } from '@wcpos/components/lib/device';

export function ScopeRow({
	date,
	chips,
	actions,
	testID,
}: {
	/** The DateButton: the row's title, left. */
	date: React.ReactNode;
	/** Chips that scope every card, in order. */
	chips?: React.ReactNode;
	/** The row's right end: Print summary or Export CSV. */
	actions?: React.ReactNode;
	testID: string;
}): React.JSX.Element {
	const phone = useIsPhone();
	if (phone)
		return (
			<View testID={testID} className="gap-2">
				<View className="flex-row items-center justify-between gap-2">
					{date}
					{actions}
				</View>
				{chips && (
					<ScrollView
						horizontal
						showsHorizontalScrollIndicator={false}
						contentContainerClassName="flex-row items-center gap-2"
					>
						{chips}
					</ScrollView>
				)}
			</View>
		);
	return (
		<View testID={testID} className="flex-row items-center gap-2">
			<View className="shrink-0">{date}</View>
			<View className="min-w-0 flex-1 flex-row flex-wrap items-center gap-2">{chips}</View>
			<View className="shrink-0 items-end">{actions}</View>
		</View>
	);
}
