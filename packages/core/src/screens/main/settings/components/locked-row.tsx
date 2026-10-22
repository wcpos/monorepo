import * as React from 'react';

import { Switch } from '@wcpos/components/switch';
import { Text } from '@wcpos/components/text';

import { SettingsRow } from './settings-row';

/**
 * A read-only row for a setting WooCommerce owns: a boolean shows as a disabled switch,
 * anything else as its text (an em dash when empty).
 */
export function LockedRow({
	label,
	value,
	testID,
}: {
	label: string;
	value?: string | boolean;
	testID: string;
}) {
	return (
		<SettingsRow inline label={label} testID={testID}>
			{typeof value === 'boolean' ? (
				<Switch
					checked={value}
					onCheckedChange={() => {}}
					disabled
					testID={`${testID}-switch`}
					accessibilityLabel={label}
				/>
			) : (
				<Text>{value || '—'}</Text>
			)}
		</SettingsRow>
	);
}
