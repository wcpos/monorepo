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
