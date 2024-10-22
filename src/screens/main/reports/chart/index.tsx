import * as React from 'react';

import { parseISO } from 'date-fns';
import { useObservableEagerState, useObservableSuspense } from 'observable-hooks';
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

import type { OrderDocument } from '@wcpos/database';

import { Tooltip } from './tooltip';
import { aggregateData } from './utils';
import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';

interface Props {
	orders: OrderDocument[];
}

/**
 *
 */
export const Chart = ({ orders }: Props) => {
	const t = useT();
	const { store } = useAppState();
	const currency = useObservableEagerState(store.currency$);

	const data = React.useMemo(() => aggregateData(orders), [orders]);
	console.log('data', data);

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
				/>
				<RechartsTooltip content={<Tooltip />} />
				<Bar yAxisId="total" dataKey="total" stackId="a" fill="#127FBF" />
				<Bar yAxisId="total" dataKey="total_tax" stackId="a" fill="#627D98" />
				<Line yAxisId="orders" type="monotone" dataKey="order_count" stroke="#829AB1" />
			</ComposedChart>
		</ResponsiveContainer>
	);
};
