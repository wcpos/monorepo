import * as React from 'react';
import { View } from 'react-native';

import { Label } from '@wcpos/components/label';
import { Text } from '@wcpos/components/text';

interface SettingsRowProps {
	label: string;
	description?: string;
	/**
	 * Keep label and control on one line at every screen size (switches and
	 * other compact controls). Default rows go label-left on md+, stacked on sm.
	 */
	inline?: boolean;
	children: React.ReactNode;
	testID?: string;
}

/**
 * One setting: label (+ optional hint) on the left, control on the right.
 * No divider — rows separate by rhythm alone. Stacks label-above-control on
 * small screens with a full-width control.
 */
export function SettingsRow({ label, description, inline, children, testID }: SettingsRowProps) {
	if (inline) {
		return (
			<View testID={testID} className="flex-row items-center justify-between gap-4 py-2.5">
				<View className="flex-1 gap-0.5">
					<Label>{label}</Label>
					{!!description && <Text className="text-muted-foreground text-xs">{description}</Text>}
				</View>
				{children}
			</View>
		);
	}

	return (
		<View testID={testID} className="gap-2 py-2.5 md:flex-row md:items-center md:gap-6">
			<View className="shrink-0 gap-0.5 md:w-64 lg:w-72">
				<Label>{label}</Label>
				{!!description && <Text className="text-muted-foreground text-xs">{description}</Text>}
			</View>
			<View className="md:flex-1 md:flex-row md:justify-end">
				<View className="w-full md:max-w-80">{children}</View>
			</View>
		</View>
	);
}
