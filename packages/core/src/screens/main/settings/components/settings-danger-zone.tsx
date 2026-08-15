import * as React from 'react';
import { View } from 'react-native';

import { Button } from '@wcpos/components/button';
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
	return (
		<View className="border-border/50 mt-2 gap-3 border-t pt-4 md:flex-row md:items-center md:justify-between">
			<Text className="text-muted-foreground text-xs md:max-w-96 md:flex-1">{description}</Text>
			<Button
				variant="outline-destructive"
				size="sm"
				onPress={onPress}
				loading={loading}
				testID={testID}
			>
				<Text>{buttonLabel}</Text>
			</Button>
		</View>
	);
}
