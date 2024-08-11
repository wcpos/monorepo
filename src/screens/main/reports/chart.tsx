import * as React from 'react';

import {
	format,
	parseISO,
	eachDayOfInterval,
	eachHourOfInterval,
	eachWeekOfInterval,
	eachMonthOfInterval,
	addHours,
	startOfWeek,
	startOfMonth,
	startOfDay,
	startOfHour,
} from 'date-fns';
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

import { Box } from '@wcpos/tailwind/src/box';
import { Text } from '@wcpos/tailwind/src/text';

import { useAppState } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';
import { useCurrencyFormat } from '../hooks/use-currency-format';

// Helper function to aggregate data
const aggregateData = (hits, interval, allDates) => {
	const dataMap = {};

	hits.forEach((hit) => {
		const { date_completed_gmt, total, total_tax } = hit.document; // Extract properties

		const date = parseISO(date_completed_gmt);
		const key = format(date, interval);

		if (!dataMap[key]) {
			dataMap[key] = { date: key, total: 0, total_tax: 0, order_count: 0 };
		}

		dataMap[key].total += parseFloat(total);
		dataMap[key].total_tax += parseFloat(total_tax);
		dataMap[key].order_count += 1;
	});

	// Fill in missing dates
	allDates.forEach((date) => {
		const key = format(date, interval);
		if (!dataMap[key]) {
			dataMap[key] = { date: key, total: 0, total_tax: 0, order_count: 0 };
		}
	});

	return Object.values(dataMap).sort((a, b) => new Date(a.date) - new Date(b.date));
};

const determineInterval = (hits) => {
	const dates = hits.map((hit) => parseISO(hit.document.date_completed_gmt));
	const minDate = Math.min(...dates);
	const maxDate = Math.max(...dates);
	const diff = maxDate - minDate;

	const ONE_DAY = 24 * 60 * 60 * 1000;
	const ONE_HOUR = 60 * 60 * 1000;
	const ONE_WEEK = 7 * ONE_DAY;
	const ONE_MONTH = 30 * ONE_DAY;

	if (diff > ONE_MONTH) {
		return { format: 'yyyy-MM', interval: 'months' }; // Aggregate by month
	} else if (diff > ONE_WEEK) {
		return { format: 'yyyy-MM-dd', interval: 'weeks' }; // Aggregate by week, use start date of week
	} else if (diff > ONE_DAY) {
		return { format: 'yyyy-MM-dd', interval: 'days' }; // Aggregate by day
	} else if (diff > ONE_HOUR) {
		return { format: 'yyyy-MM-dd HH', interval: '6hours' }; // Aggregate by 6 hours
	} else {
		return { format: 'yyyy-MM-dd HH', interval: 'hours' }; // Aggregate by hour
	}
};

const generateAllDates = (minDate, maxDate, interval) => {
	if (interval === 'months') {
		return eachMonthOfInterval({ start: startOfMonth(minDate), end: maxDate });
	} else if (interval === 'weeks') {
		return eachWeekOfInterval({ start: startOfWeek(minDate), end: maxDate });
	} else if (interval === 'days') {
		return eachDayOfInterval({ start: startOfDay(minDate), end: maxDate });
	} else if (interval === '6hours') {
		const dates = [];
		for (let date = startOfHour(minDate); date <= maxDate; date = addHours(date, 6)) {
			dates.push(date);
		}
		return dates;
	} else {
		return eachHourOfInterval({ start: startOfHour(minDate), end: maxDate });
	}
};

/**
 *
 */
const CustomTooltip = ({ active, payload, label }) => {
	const t = useT();
	const { format } = useCurrencyFormat();

	const getLabel = React.useCallback(
		(value) => {
			switch (value) {
				case 'total':
					return t('Total', { _tags: 'core' });
				case 'total_tax':
					return t('Total Tax', { _tags: 'core' });
				case 'order_count':
					return t('Orders', { _tags: 'core' });
				default:
					return value;
			}
		},
		[t]
	);

	if (active && payload && payload.length) {
		return (
			<Box style={{ backgroundColor: 'white' }} rounding="small" padding="xSmall">
				<Text weight="semiBold">{`${label}`}</Text>
				<Text type="primary">{`${getLabel(payload[0].name)}: ${format(payload[0].value)}`}</Text>
				<Text type="secondary">{`${getLabel(payload[1].name)}: ${format(payload[1].value)}`}</Text>
				<Text type="textMuted">{`${getLabel(payload[2].name)}: ${payload[2].value}`}</Text>
			</Box>
		);
	}

	return null;
};

/**
 *
 */
export const Chart = ({ query }) => {
	const t = useT();
	const { store } = useAppState();
	const currency = useObservableEagerState(store.currency$);
	const result = useObservableSuspense(query.resource);

	const { format: dateFormat, interval } = React.useMemo(
		() => determineInterval(result.hits),
		[result.hits]
	);
	const dates = result.hits.map((hit) => parseISO(hit.document.date_completed_gmt));
	const minDate = new Date(Math.min(...dates));
	const maxDate = new Date(Math.max(...dates));
	const allDates = React.useMemo(
		() => generateAllDates(minDate, maxDate, interval),
		[minDate, maxDate, interval]
	);

	const data = React.useMemo(
		() => aggregateData(result.hits, dateFormat, allDates),
		[result.hits, dateFormat, allDates]
	);
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
				<RechartsTooltip content={<CustomTooltip />} />
				<Bar yAxisId="total" dataKey="total" stackId="a" fill="#127FBF" />
				<Bar yAxisId="total" dataKey="total_tax" stackId="a" fill="#627D98" />
				<Line yAxisId="orders" type="monotone" dataKey="order_count" stroke="#829AB1" />
			</ComposedChart>
		</ResponsiveContainer>
	);
};
