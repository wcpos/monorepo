import React, { useCallback, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';
import { Circle, RoundedRect, Text, useFont } from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import { CartesianChart, StackedBar } from 'victory-native';

import { findClosestPoint } from './findClosestPoint';
import { useCurrencyFormat } from '../../hooks/use-currency-format';
import { useReports } from '../context';
import { aggregateData } from './utils';

type DataPoint = {
	date: string;
	total: number;
	total_tax: number;
};

type TooltipState = {
	visible: boolean;
	x: number;
	y: number;
	point?: DataPoint;
};

export default function SkiaChart() {
	const { selectedOrders } = useReports();
	const { format } = useCurrencyFormat();
	const font = useFont(require('@wcpos/main/assets/fonts/Inter-Medium.ttf'), 12);

	const data = useMemo<DataPoint[]>(() => aggregateData(selectedOrders), [selectedOrders]);
	const maxTotal = Math.max(...data.map((d) => d.total + d.total_tax), 0);

	// React state for tooltip
	const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, x: 0, y: 0 });

	// SharedValues for gesture calculation
	const ox = useSharedValue<number[]>([]);
	const chartBounds = useSharedValue<{ top: number; bottom: number } | null>(null);

	// JS callback to update React state
	const showTooltip = useCallback((x: number, y: number, point: DataPoint) => {
		setTooltip({ visible: true, x, y, point });
	}, []);

	const hideTooltip = useCallback(() => {
		setTooltip((ts) => ({ ...ts, visible: false }));
	}, []);

	// Worklet: find index, compute pos and data, then call JS
	const handleSelect = (eventX: number) => {
		'worklet';
		const idx = findClosestPoint(ox.value, eventX);
		if (idx === null || !chartBounds.value) return;

		const pt = data[idx];
		const height = chartBounds.value.bottom - chartBounds.value.top;
		const total = pt.total + pt.total_tax;
		const yPos = chartBounds.value.bottom - (total / maxTotal) * height;
		const xPos = ox.value[idx];

		runOnJS(showTooltip)(xPos, yPos, pt);
	};

	React.useEffect(() => {
		if (tooltip.visible && Platform.OS !== 'web') {
			Haptics.selectionAsync();
		}
	}, [tooltip.visible]);

	const tap = Gesture.Tap()
		.onBegin((e) => {
			handleSelect(e.x);
		})
		.onFinalize(() => {
			runOnJS(hideTooltip)();
		});

	const hover = Gesture.Hover()
		.onBegin((e) => handleSelect(e.x))
		.onUpdate((e) => handleSelect(e.x))
		.onEnd(() => runOnJS(hideTooltip)());

	const combined = Gesture.Simultaneous(tap, hover);

	return (
		<GestureDetector gesture={combined}>
			<CartesianChart
				data={data}
				xKey="date"
				yKeys={['total', 'total_tax']}
				domainPadding={{ left: 100, right: 100, top: 20 }}
				customGestures={combined}
				xAxis={{
					font,
					lineColor: '#E5E7EB',
					labelColor: 'rgb(36, 59, 83)',
					formatXLabel: (v) => (typeof v === 'string' ? v : ''),
				}}
				yAxis={[
					{
						yKeys: ['total', 'total_tax'],
						font,
						lineColor: '#E5E7EB',
						labelColor: 'rgb(36, 59, 83)',
						domain: [0, Math.max(maxTotal, 10)],
						formatYLabel: format,
					},
				]}
			>
				{({ points, chartBounds: bounds, xTicks, xScale }) => {
					// keep shared values up to date
					ox.value = xTicks.map((t) => xScale(t)!);
					chartBounds.value = { top: bounds.top, bottom: bounds.bottom };

					return (
						<>
							<StackedBar
								chartBounds={bounds}
								points={[points.total, points.total_tax]}
								colors={['#FADB5F', '#F7C948']}
								animate={{ type: 'spring' }}
								barOptions={({ isTop }) => ({
									roundedCorners: isTop ? { topLeft: 5, topRight: 5 } : undefined,
								})}
							/>
							{tooltip.visible && tooltip.point && (
								<ToolTip
									x={tooltip.x}
									y={tooltip.y}
									point={tooltip.point}
									format={format}
									font={font}
								/>
							)}
						</>
					);
				}}
			</CartesianChart>
		</GestureDetector>
	);
}

function ToolTip({
	x,
	y,
	point,
	format,
	font,
}: {
	x: number;
	y: number;
	point: DataPoint;
	format: (v: number) => string;
	font: any;
}) {
	const W = 140,
		H = 60,
		P = 8;
	return (
		<>
			<RoundedRect
				x={x - W / 2}
				y={y - H - 15}
				width={W}
				height={H}
				r={8}
				color="rgba(0,0,0,0.8)"
			/>
			<Text x={x - W / 2 + P} y={y - H - 15 + P + 12} text={point.date} font={font} color="white" />
			<Text
				x={x - W / 2 + P}
				y={y - H - 15 + P + 28}
				text={`Total: ${format(point.total)}`}
				font={font}
				color="white"
			/>
			<Text
				x={x - W / 2 + P}
				y={y - H - 15 + P + 44}
				text={`Tax: ${format(point.total_tax)}`}
				font={font}
				color="white"
			/>
			<Circle cx={x} cy={y} r={4} color="rgba(0,0,0,0.8)" />
		</>
	);
}
