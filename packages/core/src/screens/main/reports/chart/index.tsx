import * as React from 'react';
import { View, Text } from 'react-native';

import { useObservableEagerState } from 'observable-hooks';
import { useSharedValue } from 'react-native-reanimated';
import { CartesianChart } from 'victory-native';

import { aggregateData } from './utils';
import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { useCurrencyFormat } from '../../hooks/use-currency-format';
import { useNumberFormat } from '../../hooks/use-number-format';
import { useReports } from '../context';

/**
 * Chart component using Victory Native XL
 */
export const Chart = () => {
	const t = useT();
	const { store } = useAppState();
	const currency = useObservableEagerState(store.currency$);
	const { format: formatNumber } = useNumberFormat();
	const { format: formatCurrency } = useCurrencyFormat();
	const { selectedOrders } = useReports();

	// For pan and zoom state
	const scale = useSharedValue(1);
	const offsetX = useSharedValue(0);
	const offsetY = useSharedValue(0);

	const data = React.useMemo(() => aggregateData(selectedOrders), [selectedOrders]);
	const maxOrderCount = Math.max(...data.map((item) => item.order_count || 0), 1);
	const maxTotal = Math.max(...data.map((item) => item.total + item.total_tax), 1);

	// Scale factor for order count to be visible on the same scale as money values
	const scaleFactor = maxTotal / maxOrderCount;

	// Add a scaled order count for the chart to use
	const enhancedData = React.useMemo(
		() =>
			data.map((item) => ({
				...item,
				scaled_order_count: item.order_count * scaleFactor,
			})),
		[data, scaleFactor]
	);

	return (
		<View style={{ flex: 1, height: 400 }}>
			<CartesianChart
				data={enhancedData}
				xKey="date"
				yKeys={['total', 'total_tax', 'scaled_order_count']}
				domainPadding={{ left: 20, right: 20, bottom: 0, top: 20 }}
			>
				{({ points, chartBounds }) => {
					// Exit early if no data or points aren't an object
					if (!points || typeof points !== 'object') return null;

					// Get points for each series
					const totalPoints = points.total || [];
					const taxPoints = points.total_tax || [];
					const orderPoints = points.scaled_order_count || [];

					// For bar width calculation - make sure we have points
					const barWidth = Math.min(
						30,
						totalPoints.length > 0
							? (chartBounds.right - chartBounds.left) / totalPoints.length / 2
							: 30
					);

					// Chart height for positioning
					const chartHeight = chartBounds.bottom - chartBounds.top;

					// Draw the visualizations
					return (
						<>
							{/* Draw grid lines (background) */}
							<View
								style={{
									position: 'absolute',
									left: chartBounds.left,
									top: chartBounds.top,
									width: chartBounds.right - chartBounds.left,
									height: chartBounds.bottom - chartBounds.top,
									borderWidth: 1,
									borderColor: '#f5f5f5',
								}}
							/>

							{/* Draw axis labels */}
							<Text
								style={{
									position: 'absolute',
									left: 10,
									top: chartHeight / 2,
									transform: [{ rotate: '-90deg' }],
									textAlign: 'center',
									color: '#243B53',
									fontSize: 12,
								}}
							>
								{t('Total ({currency})', { currency, _tags: 'core' })}
							</Text>

							<Text
								style={{
									position: 'absolute',
									right: -10,
									top: chartHeight / 2,
									transform: [{ rotate: '90deg' }],
									textAlign: 'center',
									color: '#243B53',
									fontSize: 12,
								}}
							>
								{t('Orders', { _tags: 'core' })}
							</Text>

							{/* Draw bars for total */}
							{totalPoints.map((point, i) => (
								<View
									key={`total-${i}`}
									style={{
										position: 'absolute',
										left: point.x - barWidth / 2,
										top: point.y,
										width: barWidth,
										height: chartBounds.bottom - point.y,
										backgroundColor: '#127FBF',
									}}
								/>
							))}

							{/* Draw bars for tax stacked on top of total */}
							{taxPoints.map((point, i) => {
								const totalPoint = totalPoints[i];
								if (!totalPoint) return null;
								return (
									<View
										key={`tax-${i}`}
										style={{
											position: 'absolute',
											left: point.x - barWidth / 2,
											top: point.y,
											width: barWidth,
											height: totalPoint.y - point.y,
											backgroundColor: '#627D98',
										}}
									/>
								);
							})}

							{/* Draw lines connecting order points */}
							{orderPoints.map((point, i) => {
								if (i === 0) return null;
								const prevPoint = orderPoints[i - 1];
								if (!prevPoint) return null;

								// Draw as absolute positioned element with border
								return (
									<View
										key={`line-${i}`}
										style={{
											position: 'absolute',
											left: prevPoint.x,
											top: Math.min(prevPoint.y, point.y),
											width: point.x - prevPoint.x,
											height: Math.abs(point.y - prevPoint.y) + 1,
											borderColor: '#829AB1',
											borderWidth: 2,
											borderTopWidth: prevPoint.y <= point.y ? 2 : 0,
											borderBottomWidth: prevPoint.y > point.y ? 2 : 0,
											borderLeftWidth: 2,
											borderRightWidth: 0,
										}}
									/>
								);
							})}

							{/* Draw points for orders */}
							{orderPoints.map((point, i) => (
								<View
									key={`point-${i}`}
									style={{
										position: 'absolute',
										left: point.x - 4,
										top: point.y - 4,
										width: 8,
										height: 8,
										borderRadius: 4,
										backgroundColor: '#829AB1',
									}}
								/>
							))}
						</>
					);
				}}
			</CartesianChart>
		</View>
	);
};
