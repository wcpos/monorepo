import { LinearGradient, useFont, vec } from '@shopify/react-native-skia';
import { Bar, CartesianChart } from 'victory-native';

const data = Array.from({ length: 6 }, (_, index) => ({
	// Starting at 1 for Jaunary
	month: index + 1,
	// Randomizing the listen count between 100 and 50
	listenCount: Math.floor(Math.random() * (100 - 50 + 1)) + 50,
}));

export default function SkiaChart() {
	const font = useFont('Inter_500Medium', 12);

	return (
		<CartesianChart
			data={data}
			xKey="month"
			yKeys={['listenCount']}
			domainPadding={{ left: 50, right: 50, top: 30 }}
			axisOptions={{
				font,
				formatXLabel(value) {
					const date = new Date(2023, value - 1);
					return date.toLocaleString('default', { month: 'short' });
				},
			}}
		>
			{({ points, chartBounds }) => (
				<Bar
					chartBounds={chartBounds}
					points={points.listenCount}
					roundedCorners={{
						topLeft: 5,
						topRight: 5,
					}}
				>
					<LinearGradient start={vec(0, 0)} end={vec(0, 400)} colors={['#a78bfa', '#a78bfa50']} />
				</Bar>
			)}
		</CartesianChart>
	);
}
