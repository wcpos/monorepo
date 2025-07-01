import React from 'react';
import { Platform, StyleSheet } from 'react-native';

import { Circle, DashPathEffect, Line, useFont, vec } from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import {
	type SharedValue,
	useAnimatedReaction,
	useDerivedValue,
	useSharedValue,
	withTiming,
} from 'react-native-reanimated';
import { CartesianChart, Line as LineChart, StackedBar, useChartPressState } from 'victory-native';

import { useReports } from '../context';
import { aggregateData } from './utils';

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
	const { selectedOrders } = useReports();

	const data = React.useMemo(() => aggregateData(selectedOrders), [selectedOrders]);

	// Calculate dynamic domains
	const maxTotal = Math.max(...data.map((item) => item.total + item.total_tax), 0);
	const maxOrderCount = Math.max(...data.map((item) => item.order_count), 0);

	console.log('data', data);
	console.log('maxOrderCount', maxOrderCount);
	console.log('maxTotal', maxTotal);

	const font = useFont(require('@wcpos/main/assets/fonts/Inter-Medium.ttf'), 12);
	const [chartLeft, setChartLeft] = React.useState(0);
	const [chartRight, setChartRight] = React.useState(0);
	const { state, isActive } = useChartPressState({
		x: '',
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
			xKey="date"
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
					// The value here is the date string from your data
					// It could be "00:00", "02:00" for hours, or "2023-01-01" for days, etc.
					return value;
				},
			}}
			yAxis={[
				{
					yKeys: ['total', 'total_tax'],
					font,
					domain: [0, Math.max(maxTotal * 1.1, 10)], // Add 10% padding, minimum 10
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
					domain: [0, Math.max(maxOrderCount * 1.1, 5)], // Add 10% padding, minimum 5
					formatYLabel(value) {
						return Math.round(value).toString();
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
						colors={['#FADB5F', '#F7C948']}
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
						color="#127FBF"
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
