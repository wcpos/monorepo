import * as React from 'react';
import { View } from 'react-native';

import { Button } from '@wcpos/components/button';
import { useIsPhone } from '@wcpos/components/lib/device';
import { cn } from '@wcpos/components/lib/utils';
import { Text } from '@wcpos/components/text';

interface SettingsDangerZoneProps {
	description: string;
	buttonLabel: string;
	onPress: () => void;
	loading?: boolean;
	testID?: string;
}

/**
 * Quiet footer zone for destructive meta-actions (e.g. restore server
 * settings) — out of the form flow, with an explanation of what it does.
 */
export function SettingsDangerZone({
	description,
	buttonLabel,
	onPress,
	loading,
	testID,
}: SettingsDangerZoneProps) {
	const phone = useIsPhone();
	return (
		<View
			className={cn(
				'border-border border-t-hairline mt-2 gap-3 pt-4',
				!phone && 'flex-row items-center justify-between'
			)}
		>
			<Text variant="help" className={cn(!phone && 'max-w-96 flex-1')}>
				{description}
			</Text>
			<Button variant="outline-destructive" onPress={onPress} loading={loading} testID={testID}>
				<Text>{buttonLabel}</Text>
			</Button>
		</View>
	);
}
