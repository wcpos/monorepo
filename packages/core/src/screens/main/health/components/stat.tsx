import * as React from 'react';
import { Pressable, View } from 'react-native';

import { cn } from '@wcpos/components/lib/utils';
import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';

export type StatTone = 'default' | 'good' | 'bad';

const TONE_CLASS: Record<StatTone, string> = {
	default: '',
	good: 'text-success',
	bad: 'text-destructive',
};

/**
 * One number in a stat header. When `onPress` is given the number doubles as a
 * filter control (per the Store health idiom: stats are the primary filters).
 */
export function Stat({
	value,
	label,
	tone = 'default',
	onPress,
	testID,
}: {
	value: string | number;
	label: string;
	tone?: StatTone;
	onPress?: () => void;
	testID?: string;
}) {
	const body = (
		<View className="gap-0">
			<Text className={cn('text-lg font-semibold tabular-nums', TONE_CLASS[tone])}>
				{typeof value === 'number' ? value.toLocaleString() : value}
			</Text>
			<Text className="text-muted-foreground text-xs">{label}</Text>
		</View>
	);

	if (!onPress) {
		return <View testID={testID}>{body}</View>;
	}

	return (
		<Pressable
			testID={testID}
			accessibilityRole="button"
			accessibilityLabel={label}
			onPress={onPress}
			className="web:hover:bg-muted/50 -m-1 rounded-md p-1"
		>
			{body}
		</Pressable>
	);
}

/**
 * The stat row that opens every Store health tab: stats left, actions right,
 * hairline underneath. Wraps on narrow screens.
 */
export function StatHeader({
	children,
	actions,
	testID,
}: {
	children: React.ReactNode;
	actions?: React.ReactNode;
	testID?: string;
}) {
	return (
		<HStack
			testID={testID}
			className="border-border flex-wrap items-start gap-x-6 gap-y-3 border-b pb-3"
		>
			{children}
			<View className="flex-1" />
			{actions ? <HStack className="items-center gap-2">{actions}</HStack> : null}
		</HStack>
	);
}
