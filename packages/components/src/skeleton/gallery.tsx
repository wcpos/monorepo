import { View } from 'react-native';

import { Skeleton, skeletonCount } from './index';

const examples = {
	block: (
		<View className="h-24 w-40">
			<Skeleton />
		</View>
	),
	line: (
		<View className="gap-2">
			<Skeleton shape="line" className="w-full" />
			<Skeleton shape="line" className="w-4/5" />
			<Skeleton shape="line" className="w-3/5" />
		</View>
	),
	row: (
		<View className="gap-2">
			{[0, 1, 2].map((key) => (
				<Skeleton key={key} shape="row" />
			))}
		</View>
	),
	tile: (
		<View className="gap-2">
			{[0, 1].map((row) => (
				<View key={row} className="flex-row gap-2">
					{[0, 1, 2].map((key) => (
						<Skeleton key={key} shape="tile" className="flex-1" />
					))}
				</View>
			))}
		</View>
	),
	count: (
		<View className="flex-row gap-2">
			{[400, 1200].map((extent) => (
				<View key={extent} className="flex-1 gap-2">
					{Array.from({ length: skeletonCount(extent, 44) }, (_, key) => (
						<Skeleton key={key} shape="row" />
					))}
				</View>
			))}
		</View>
	),
};
export const stories = Object.entries(examples).map(([id, element]) => ({
	id,
	render: () => element,
}));
