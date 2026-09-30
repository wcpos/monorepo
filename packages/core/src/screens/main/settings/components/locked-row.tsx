import * as React from 'react';

import { Text } from '@wcpos/components/text';

import { SettingsRow } from './settings-row';

/**
 * A store-owned value shown read-only: set in WooCommerce and mirrored here,
 * so it reads as a value, not as a disabled input with no reason given.
 */
export function LockedRow({
	label,
	value,
	testID,
}: {
	label: string;
	value: string;
	testID: string;
}) {
	return (
		<SettingsRow inline label={label} testID={testID}>
			<Text>{value}</Text>
		</SettingsRow>
	);
}
