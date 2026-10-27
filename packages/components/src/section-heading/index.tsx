import * as React from 'react';
import { View } from 'react-native';

import { Text } from '../text';

/**
 * The one heading for a section in a Settings page, a dialog body or a card body (the heading
 * ladder, ruled 2026-10-25): 16 semibold foreground, its optional description `text-xs` muted.
 */
export function SectionHeading({
	title,
	description,
	testID,
}: {
	title: string;
	description?: string;
	testID?: string;
}) {
	return (
		<View testID={testID} className="gap-0.5">
			<Text role="heading" aria-level={2} className="text-foreground text-base font-semibold">
				{title}
			</Text>
			{!!description && <Text className="text-muted-foreground text-xs">{description}</Text>}
		</View>
	);
}
