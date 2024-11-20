import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';
import {
	ComposedChart,
	Line,
	Bar,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip as RechartsTooltip,
	ResponsiveContainer,
} from 'recharts';

import { Tooltip } from './tooltip';
import { aggregateData } from './utils';
import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { useNumberFormat } from '../../hooks/use-number-format';
import { useReports } from '../context';

/**
 *
 */
export const Chart = () => {
	const t = useT();
	const { store } = useAppState();
	const currency = useObservableEagerState(store.currency$);
	const { format: formatNumber } = useNumberFormat();
	const { selectedOrders } = useReports();

	const data = React.useMemo(() => aggregateData(selectedOrders), [selectedOrders]);
	const maxOrderCount = Math.max(...data.map((item) => item.order_count));

	return (
		<ResponsiveContainer width="100%" height="100%">
			<ComposedChart
				width={500}
				height={400}
				data={data}
				margin={{
					top: 20,
					right: 20,
					bottom: 60,
					left: 20,
				}}
			>
				<CartesianGrid stroke="#f5f5f5" />
				<XAxis
					dataKey="date"
					scale="band"
					fontFamily="sans-serif"
					fontSize={12}
					stroke="#243B53"
					tick={{ fill: '#243B53' }}
					interval={0}
					dy={10}
				/>
				<YAxis
					yAxisId="total"
					label={{
						value: t('Total ({currency})', { currency, _tags: 'core' }),
						angle: -90,
						position: 'insideLeft',
						fontFamily: 'sans-serif',
						fontSize: 12,
						fill: '#243B53',
					}}
					fontFamily="sans-serif"
					fontSize={12}
					stroke="#243B53"
					tick={{ fill: '#243B53' }}
					tickFormatter={(value) => formatNumber(value)}
				/>
				<YAxis
					yAxisId="orders"
					orientation="right"
					label={{
						value: t('Orders', { _tags: 'core' }),
						angle: 90,
						position: 'insideRight',
						fontFamily: 'sans-serif',
						fontSize: 12,
						fill: '#243B53',
					}}
					fontFamily="sans-serif"
					fontSize={12}
					stroke="#243B53"
					tick={{ fill: '#243B53' }}
					tickFormatter={(value) => formatNumber(value)}
					tickCount={maxOrderCount + 1}
				/>
				<RechartsTooltip content={(props) => <Tooltip {...props} />} />
				<Bar yAxisId="total" dataKey="total" stackId="a" fill="#127FBF" />
				<Bar yAxisId="total" dataKey="total_tax" stackId="a" fill="#627D98" />
				<Line yAxisId="orders" type="monotone" dataKey="order_count" stroke="#829AB1" />
			</ComposedChart>
		</ResponsiveContainer>
	);
};
