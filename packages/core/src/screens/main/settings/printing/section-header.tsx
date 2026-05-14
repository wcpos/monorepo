import * as React from 'react';
import { View } from 'react-native';

import { HStack } from '@wcpos/components/hstack';
import { Icon, type IconName } from '@wcpos/components/icon';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

interface SectionHeaderProps {
	icon: IconName;
	title: string;
	description: string;
}

/**
 * Settings section header — a tinted icon square, a bold title, and a one-line
 * muted description. Local to the Printing tab; promote to a shared location only
 * if another settings tab needs the same treatment.
 */
export function SectionHeader({ icon, title, description }: SectionHeaderProps) {
	return (
		<HStack className="items-start gap-3">
			<View className="bg-primary/10 rounded-lg p-2">
				<Icon name={icon} variant="primary" size="lg" />
			</View>
			<VStack className="flex-1 gap-0.5">
				<Text className="text-sm font-bold">{title}</Text>
				<Text className="text-muted-foreground text-xs">{description}</Text>
			</VStack>
		</HStack>
	);
}
