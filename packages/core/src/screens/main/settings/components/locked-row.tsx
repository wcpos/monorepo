import * as React from 'react';

import { Text } from '@wcpos/components/text';

import { SettingsRow } from './settings-row';

export function LockedRow({
	label,
	value,
	testID,
}: {
	label: string;
	value?: string;
	testID: string;
}) {
	return (
		<SettingsRow inline label={label} testID={testID}>
			<Text>{value || '—'}</Text>
		</SettingsRow>
	);
}
