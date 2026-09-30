import * as React from 'react';
import { View } from 'react-native';

import { Button } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';

interface SettingsDangerZoneProps {
	description: string;
	buttonLabel: string;
	onPress: () => void;
	loading?: boolean;
	/** The action's result, shown at the row beside its button. */
	status?: React.ReactNode;
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
	status,
	testID,
}: SettingsDangerZoneProps) {
	return (
		<View className="border-border mt-2 gap-3 border-t pt-4 md:flex-row md:items-center md:justify-between">
			<Text className="text-muted-foreground text-xs md:max-w-96 md:flex-1">{description}</Text>
			<HStack className="flex-wrap items-center gap-3">
				{status}
				<Button
					variant="outline-destructive"
					size="sm"
					onPress={onPress}
					loading={loading}
					testID={testID}
				>
					<Text>{buttonLabel}</Text>
				</Button>
			</HStack>
		</View>
	);
}
