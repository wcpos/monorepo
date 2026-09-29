/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import Chart from './chart';

import type { ReportsData } from '../context';

let mockView = 'hour';
const mockCurrent = [
	{ date_created_gmt: '2026-09-22T08:05:00Z', total: '10' },
	{ date_created_gmt: '2026-09-22T09:05:00Z', total: '20' },
];
const mockPrevious = [
	{ date_created_gmt: '2026-09-21T08:05:00Z', total: '15' },
	{ date_created_gmt: '2026-09-21T14:05:00Z', total: '40' },
];
let mockPeriod = 'day';
let mockData = {
	selectedOrders: mockCurrent,
	comparisonOrders: mockPrevious.slice(0, 1),
	wholeComparisonOrders: mockPrevious,
	dateRange: { start: new Date('2026-09-21T23:00:00Z'), end: new Date('2026-09-22T22:59:59.999Z') },
	comparisonRange: {
		start: new Date('2026-09-20T23:00:00Z'),
		end: new Date('2026-09-21T22:59:59.999Z'),
	},
	live: true,
	totals: { total: 30 },
} as ReportsData;
const mockBounds = { left: 0, right: 320, top: 0, bottom: 190 };
let mockHover: (e: { x: number }) => void;
let mockTicks: number[];
let mockLabel: (n: number) => string;
jest.mock('../../../../assets/fonts/Inter-Medium.ttf', () => 1);
jest.mock('../../health/database-logic', () => ({}));
jest.mock('../context', () => ({
	useReportsData: () => mockData,
	useReportsScope: () => ({ chartView: mockView, cmp: 'yesterday' }),
	useReportsPeriod: () => ({ period: mockPeriod, timezone: 'Europe/London', storeId: 9 }),
}));
jest.mock('../../../../hooks/use-store-day', () => ({
	...jest.requireActual('../../../../hooks/use-store-day'),
	useViewedStore: () => ({ currency: 'GBP' }),
}));
jest.mock('../../../../contexts/app-state', () => ({}));
jest.mock('@wcpos/query', () => ({ useDocField: (value: unknown) => value }));
jest.mock('../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ format: (n: number) => `£${n.toFixed(2)}` }),
}));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../../jest/translate').createTestT(),
}));
jest.mock('../../../../hooks/use-local-date', () => ({
	convertUTCStringToLocalDate: (date: string) => new Date(date),
	useLocalDate: () => ({ formatDate: jest.requireActual('date-fns').format }),
}));
jest.mock('uniwind', () => ({ useCSSVariable: (tokens: string[]) => tokens }));
jest.mock('@wcpos/components/text', () => ({ Text: jest.requireActual('react-native').Text }));
jest.mock('react-native-gesture-handler', () => {
	const gesture = {
		onBegin: (fn: typeof mockHover) => {
			mockHover = fn;
			return gesture;
		},
		onUpdate: () => gesture,
		onEnd: () => gesture,
		runOnJS: () => gesture,
	};
	return {
		Gesture: { Hover: () => gesture },
		GestureDetector: ({ children }: React.PropsWithChildren) => <>{children}</>,
	};
});
jest.mock('@shopify/react-native-skia', () => ({
	useFont: () => ({ measureText: (value: string) => ({ width: value.length * 6 }) }),
	RoundedRect: ({ color, opacity, height }: { color: string; opacity: number; height: number }) => (
		<div data-testid="rect" data-color={color} data-opacity={opacity} data-height={height} />
	),
	Text: ({ text }: { text: string }) => <span>{text}</span>,
	Circle: () => null,
	Line: () => null,
	DashPathEffect: ({ intervals }: { intervals: number[] }) => (
		<span data-testid="dash">{intervals.join('/')}</span>
	),
}));
jest.mock('victory-native', () => ({
	CartesianChart: ({
		data,
		children,
		onChartBoundsChange,
		onScaleChange,
		xAxis,
	}: {
		data: Record<string, number | null>[];
		children: (v: unknown) => React.ReactNode;
		onChartBoundsChange: (v: typeof mockBounds) => void;
		onScaleChange: (x: (n: number) => number, y: (n: number) => number) => void;
		xAxis: { tickValues: number[]; formatXLabel: typeof mockLabel };
	}) => {
		React.useEffect(() => {
			onChartBoundsChange(mockBounds);
			onScaleChange(
				(n) => n * 40 + 20,
				(n) => 190 - n
			);
		}, [onChartBoundsChange, onScaleChange]);
		mockTicks = xAxis.tickValues;
		mockLabel = xAxis.formatXLabel;
		const points = Object.fromEntries(
			['current', 'comparison', 'futureTotal'].map((key) => [
				key,
				data.map((row, index) => ({
					x: index * 40 + 20,
					xValue: index,
					y: row[key] == null ? null : 190 - row[key],
					yValue: row[key],
				})),
			])
		);
		return (
			<div data-testid="canvas" onMouseMove={() => mockHover({ x: 20 })}>
				{children({ points, chartBounds: mockBounds })}
			</div>
		);
	},
	Line: ({
		points,
		strokeWidth,
		children,
	}: React.PropsWithChildren<{ points: { yValue: number | null }[]; strokeWidth: number }>) => (
		<div data-testid={`line-${strokeWidth}`}>
			{JSON.stringify(points.map((p) => p.yValue))}
			{children}
		</div>
	),
	Area: ({ opacity }: { opacity: number }) => <span data-testid="area">{opacity}</span>,
}));
const dayData = mockData;
beforeEach(() => {
	jest.useFakeTimers().setSystemTime(new Date('2026-09-22T10:00:00Z'));
	mockView = 'hour';
	mockPeriod = 'day';
	mockData = dayData;
});
afterEach(() => jest.useRealTimers());
// Removing the comparison or drawing future primary bars breaks this encoding.
it('draws period bars, the peak, dashed comparison and faint future comparison bars', () => {
	render(<Chart comparison />);
	expect(screen.getByTestId('hero-chart-peak').textContent).toBe('£20.00 · 1 order');
	expect(screen.getByTestId('dash').textContent).toBe('4/4');
	const bars = screen.getAllByTestId('rect');
	expect(
		bars.some((bar) => bar.dataset.color === '--color-muted' && Number(bar.dataset.height) > 0)
	).toBe(true);
	expect(bars.filter((bar) => bar.dataset.color === '--color-primary')).toHaveLength(3);
});
it('draws cumulative lines, a faint area and the whole comparison closing figure', () => {
	mockView = 'run';
	render(<Chart comparison />);
	expect(screen.getByTestId('line-2').textContent).toBe('[0,10,30,30]');
	expect(screen.getByTestId('line-3.5').textContent).toBe('[10,30]');
	expect(screen.getByTestId('area').textContent).toBe('0.1');
	expect(screen.getByTestId('hero-chart-total').textContent).toBe('£30.00 now');
	expect(screen.getByTestId('hero-chart-comparison-total').textContent).toBe('£55.00');
});
// The label reads the line's endpoint, not the whole previous period: March 31st has no April counterpart.
it('labels the comparison line with the plotted total, leaving an unmatched 31st out', () => {
	mockView = 'run';
	mockPeriod = 'month';
	mockData = {
		...dayData,
		selectedOrders: [{ date_created_gmt: '2026-04-02T12:00:00Z', total: '10' }],
		comparisonOrders: [],
		wholeComparisonOrders: [
			{ date_created_gmt: '2026-03-30T12:00:00Z', total: '20' },
			{ date_created_gmt: '2026-03-31T12:00:00Z', total: '80' },
		],
		dateRange: {
			start: new Date('2026-03-31T23:00:00Z'),
			end: new Date('2026-04-30T22:59:59.999Z'),
		},
		comparisonRange: {
			start: new Date('2026-03-01T00:00:00Z'),
			end: new Date('2026-03-31T22:59:59.999Z'),
		},
		live: false,
		totals: { total: 10 },
	} as unknown as ReportsData;
	render(<Chart comparison />);
	expect(screen.getByTestId('hero-chart-comparison-total').textContent).toBe('£20.00');
});
it('renders only the primary drawing when comparison is unavailable', () => {
	mockView = 'run';
	render(<Chart />);
	expect(screen.getByTestId('hero-chart-total').textContent).toBe('£30.00 now');
	expect(screen.queryByTestId('hero-chart-comparison-total')).toBeNull();
	expect(screen.queryByTestId('dash')).toBeNull();
});
it('caps ticks at actual buckets and omits undefined labels', () => {
	render(<Chart comparison />);
	expect(mockTicks).toEqual([0, 1, 2, 3, 4, 5, 6]);
	expect(mockLabel(0)).toBe('09:00');
	expect(mockLabel(99)).toBe('');
});
it('shows the bucket, amount, order count and comparison on hover without tax or refunds', () => {
	render(<Chart comparison />);
	fireEvent.mouseMove(screen.getByTestId('canvas'));
	expect(screen.getByText('09:00')).toBeTruthy();
	expect(screen.getByText('£10.00')).toBeTruthy();
	expect(screen.getByText('1 order')).toBeTruthy();
	expect(screen.getByText('Yesterday £15.00')).toBeTruthy();
	expect(screen.queryByText(/Tax|Refund/)).toBeNull();
});
