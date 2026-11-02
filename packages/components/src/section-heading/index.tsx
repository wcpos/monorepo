import * as React from 'react';
import { View } from 'react-native';

import { Text } from '../text';

/**
 * The one heading for a section in a Settings page, a dialog body or a card body (the heading
 * ladder, ruled 2026-10-25): the `section` rank, its optional description the `help` rank.
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
			<Text role="heading" aria-level={2} variant="section">
				{title}
			</Text>
			{!!description && <Text variant="help">{description}</Text>}
		</View>
	);
}
