import * as React from 'react';
import { View } from 'react-native';

import { Text } from '@wcpos/components/text';

type Stat = { label: string; value: string; testID: string };
export function StatGrid({ items }: { items: Stat[] }) {
	return (
		<View className="flex-row flex-wrap gap-y-3">
			{items.map((item) => (
				<View key={item.testID} className="w-1/3 gap-1 pr-2">
					<Text className="text-muted-foreground text-sm">{item.label}</Text>
					<Text testID={item.testID} className="text-foreground tabular-nums">
						{item.value}
					</Text>
				</View>
			))}
		</View>
	);
}
export function ProportionalBar({
	segments,
	testID,
}: {
	segments: { share: number; className: string }[];
	testID: string;
}) {
	const positive = segments.filter((segment) => segment.share > 0);
	return (
		<View testID={testID} className="h-2 w-full flex-row overflow-hidden rounded-md">
			{(positive.length ? positive : [{ share: 1, className: 'bg-muted' }]).map(
				(segment, index) => (
					<View key={index} className={segment.className} style={{ flex: segment.share }} />
				)
			)}
		</View>
	);
}
export function Legend({
	items,
}: {
	items: {
		swatchClassName: string;
		label: string;
		value: string;
		note?: string;
		testID?: string;
	}[];
}) {
	return (
		<View className="flex-row flex-wrap gap-x-4 gap-y-1">
			{items.map((item, index) => (
				<View key={index} className="flex-row items-center gap-2">
					<View className={`size-2.5 ${item.swatchClassName}`} />
					<Text>{item.label}</Text>
					<Text testID={item.testID} className="font-semibold tabular-nums">
						{item.value}
					</Text>
					{item.note && <Text className="text-muted-foreground text-sm">{item.note}</Text>}
				</View>
			))}
		</View>
	);
}
// The caller supplies the localized percentage and sold count together in note.
export function ShareBar({
	label,
	value,
	share,
	note,
	testID,
}: {
	label: string;
	value: string;
	share: number;
	note: string;
	testID: string;
}) {
	return (
		<View testID={testID} className="gap-1">
			<View className="flex-row justify-between gap-2">
				<Text numberOfLines={1} className="min-w-0 flex-1">
					{label}
				</Text>
				<Text className="font-semibold tabular-nums">{value}</Text>
			</View>
			<View className="bg-muted h-1 overflow-hidden rounded-md">
				<View
					className="bg-primary h-full"
					style={{ width: `${Math.max(0.02, Math.min(1, share)) * 100}%` }}
				/>
			</View>
			<Text className="text-muted-foreground text-sm">{note}</Text>
		</View>
	);
}
