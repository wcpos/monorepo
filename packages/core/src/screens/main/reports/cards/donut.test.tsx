/** @jest-environment jsdom */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { setOrders } from './test-utils';
import { Donut } from './donut';

import type { ReportOrder } from '../context';
const parts = [60, 40].map((value, i) => ({
	key: String(i),
	label: `Part ${i}`,
	value,
	valueText: `£${value}.00`,
	shareText: `${value}.0%`,
}));
const draw = (rows = parts) =>
	render(<Donut testID="ring" parts={rows} centre={{ figure: '£100.00', label: '2 ways' }} />);
beforeEach(() => setOrders([{ total: '100' } as ReportOrder]));
// Missing offsets, lost tail amounts and zero-length tiny arcs break these contracts.
it('draws one arc per part in order', () => {
	const { container } = draw();
	const arcs = container.querySelectorAll('circle');
	expect(arcs).toHaveLength(2);
	expect(arcs[0].getAttribute('stroke')).toBe('red');
	expect(arcs[1].getAttribute('stroke')).toBe('blue');
	expect(Number(arcs[0].getAttribute('stroke-dashoffset'))).toBe(0);
	expect(Number(arcs[1].getAttribute('stroke-dashoffset'))).toBeCloseTo(-2 * Math.PI * 46 * 0.6);
});
it('a given total is the denominator of the arcs and Other', () => {
	const rows = parts.map((part) => ({ ...part, value: 25 }));
	const { container, rerender } = render(
		<Donut testID="ring" parts={rows} total={50} centre={{ figure: '£50', label: '2 ways' }} />
	);
	const arcs = container.querySelectorAll('circle');
	expect(Number(arcs[1].getAttribute('stroke-dashoffset'))).toBeCloseTo(-2 * Math.PI * 46 * 0.5);
	expect(Number(arcs[0].getAttribute('stroke-dasharray')?.split(',')[0])).toBeCloseTo(
		2 * Math.PI * 46 * 0.5 - 2
	);
	rerender(
		<Donut
			testID="ring"
			parts={[
				rows[0],
				...Array.from({ length: 5 }, (_, i) => ({ ...rows[1], key: `tail-${i}`, value: 5 })),
			]}
			total={50}
			centre={{ figure: '£50', label: '6 ways' }}
		/>
	);
	expect(screen.getByTestId('ring-row-other').textContent).toContain('10.0%');
});
it('folds the sixth part onwards into Other', () => {
	const { container } = draw(
		Array.from({ length: 7 }, (_, i) => ({
			...parts[0],
			key: String(i),
			value: 10,
			valueText: '£10.00',
			shareText: '10.0%',
		}))
	);
	expect(container.querySelectorAll('circle')).toHaveLength(6);
	expect(screen.queryByTestId('ring-row-5')).toBeNull();
	expect(screen.getByTestId('ring-row-other').textContent).toContain('Other');
	expect(screen.getByTestId('ring-row-other-value').textContent).toBe('£20.00');
	expect(screen.getByTestId('ring-row-other').textContent).toContain('20.0%');
});
it('a tiny part keeps a visible arc', () => {
	const { container } = draw([{ ...parts[0], value: 0.01 }]);
	expect(container.querySelector('circle')?.getAttribute('stroke-dasharray')?.split(',')[0]).toBe(
		'2'
	);
});
it('the centre carries the figure and the label', () => {
	draw();
	expect(screen.getByTestId('ring-figure').textContent).toBe('£100.00');
	expect(screen.getByTestId('ring-figure').parentElement?.textContent).toContain('2 ways');
});
// A category a refund took below zero (ledger 36) must not draw as a sale.
it('a part at or below zero draws no arc and keeps its row', () => {
	const { container } = draw([parts[0], { ...parts[1], value: -5, valueText: '-£5.00' }]);
	expect(container.querySelectorAll('circle')).toHaveLength(1);
	expect(screen.getByTestId('ring-row-1-value').textContent).toBe('-£5.00');
});
// #3601: a bucket a refund took below zero lowers the net total, so arcs over it overlap (Codex 4577979943).
const arcFractions = (container: HTMLElement) =>
	[...container.querySelectorAll('circle')].map((arc) => ({
		length: (Number(arc.getAttribute('stroke-dasharray')?.split(',')[0]) + 2) / (2 * Math.PI * 46),
		start: -Number(arc.getAttribute('stroke-dashoffset')) / (2 * Math.PI * 46),
	}));
it('a negative bucket under a given total keeps the arcs within one circle', () => {
	const rows = [60, 40, -20].map((value, i) => ({ ...parts[0], key: String(i), value }));
	const { container } = render(
		<Donut testID="ring" parts={rows} total={80} centre={{ figure: '£80', label: '3 ways' }} />
	);
	const arcs = arcFractions(container);
	expect(arcs).toHaveLength(2);
	expect(arcs[0].length).toBeCloseTo(0.6);
	expect(arcs[1].start).toBeCloseTo(0.6);
	expect(arcs[1].length).toBeCloseTo(0.4);
});
it('a negative bucket in the tail keeps Other and the arcs within one circle', () => {
	const rows = [50, 20, 10, 10, 10, 30, -40].map((value, i) => ({
		...parts[0],
		key: String(i),
		value,
	}));
	const { container } = render(
		<Donut testID="ring" parts={rows} total={90} centre={{ figure: '£90', label: '7 ways' }} />
	);
	const arcs = arcFractions(container);
	expect(arcs).toHaveLength(5);
	expect(arcs.reduce((sum, arc) => sum + arc.length, 0)).toBeCloseTo(1);
	expect(screen.getByTestId('ring-row-other').textContent).toContain('\u221211.1%');
});
it('positive parts short of the period gross still leave the gap', () => {
	const rows = [30, 20, -10].map((value, i) => ({ ...parts[0], key: String(i), value }));
	const { container } = draw(rows);
	const arcs = arcFractions(container);
	expect(arcs[0].length).toBeCloseTo(0.3);
	expect(arcs[1].start).toBeCloseTo(0.3);
	expect(arcs[1].length).toBeCloseTo(0.2);
});
