import React from 'react';
import { StyleSheet, Platform } from 'react-native';

import { useFont, Circle, Line, DashPathEffect, vec } from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import {
	type SharedValue,
	useAnimatedReaction,
	useDerivedValue,
	useSharedValue,
	withTiming,
} from 'react-native-reanimated';
import { StackedBar, CartesianChart, Line as LineChart, useChartPressState } from 'victory-native';

const data = Array.from({ length: 10 }, (_, index) => ({
	// Starting at 1 for Jaunary
	month: index + 1,
	// Randomizing the listen count between 100 and 50
	total: Math.floor(Math.random() * (100 - 50 + 1)) + 50,
	total_tax: Math.floor(Math.random() * (100 - 50 + 1)) + 5,
	order_count: Math.floor(Math.random() * (110 - 60 + 1)) + 30,
}));

const ToolTip = ({ x, y }: { x: SharedValue<number>; y: SharedValue<number> }) => {
	return <Circle cx={x} cy={y} r={8} color="red" />;
};

const useTiming = (val: SharedValue<number>) => {
	const value = useSharedValue(0);
	useAnimatedReaction(
		() => val.value,
		(v) => {
			value.value = withTiming(v, { duration: 300 });
		}
	);
	return value;
};

export default function SkiaChart() {
	const font = useFont(require('@wcpos/main/assets/fonts/Inter-Medium.ttf'), 12);
	const [chartLeft, setChartLeft] = React.useState(0);
	const [chartRight, setChartRight] = React.useState(0);
	const { state, isActive } = useChartPressState({
		x: 0,
		y: { total: 0, total_tax: 0, order_count: 0 },
	});
	const orderCount$ = useTiming(state.y.order_count.position);
	const p1 = useDerivedValue(() => vec(chartLeft, orderCount$.value));
	const p2 = useDerivedValue(() => vec(chartRight, orderCount$.value));

	React.useEffect(() => {
		if (isActive && Platform.OS !== 'web') Haptics.selectionAsync();
	}, [isActive]);

	return (
		<CartesianChart
			data={data}
			xKey="month"
			yKeys={['total', 'total_tax', 'order_count']}
			domainPadding={{ left: 60, right: 60, top: 30 }}
			chartPressState={state}
			onChartBoundsChange={({ left, right }) => {
				setChartLeft(left);
				setChartRight(right);
			}}
			xAxis={{
				font,
				formatXLabel(value) {
					const date = new Date(2023, value - 1);
					return date.toLocaleString('default', { month: 'short' });
				},
			}}
			yAxis={[
				{
					yKeys: ['total', 'total_tax'],
					font,
					domain: [0, 250],
					formatYLabel(value) {
						return value.toLocaleString('default', {
							style: 'currency',
							currency: 'USD',
						});
					},
				},
				{
					axisSide: 'right',
					yKeys: ['order_count'],
					font,
					domain: [0, 250],
					formatYLabel(value) {
						return value.toLocaleString('default', {
							style: 'currency',
							currency: 'USD',
						});
					},
				},
			]}
		>
			{({ points, chartBounds }) => (
				<>
					{isActive && (
						<>
							<Line p1={p1} p2={p2} strokeWidth={StyleSheet.hairlineWidth}>
								<DashPathEffect intervals={[8, 4]} />
							</Line>
						</>
					)}
					<StackedBar
						chartBounds={chartBounds}
						points={[points.total, points.total_tax]}
						colors={['orange', 'gold']}
						animate={{ type: 'spring' }}
						barOptions={({ isTop }) => {
							return {
								roundedCorners: isTop
									? {
											topLeft: 5,
											topRight: 5,
										}
									: undefined,
							};
						}}
					/>
					<LineChart
						points={points.order_count}
						color="blue"
						strokeWidth={3}
						curveType="natural"
						connectMissingData
						animate={{ type: 'timing', duration: 300 }}
					/>
					{isActive && <ToolTip x={state.x.position} y={state.y.order_count.position} />}
				</>
			)}
		</CartesianChart>
	);
}
