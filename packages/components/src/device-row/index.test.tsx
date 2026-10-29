import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { TONE } from '../lib/tone';
import { DeviceList, DeviceRow, DeviceRowActions } from './index';

// Uniwind is not compiled in Jest; expose the classes.
jest.mock('react-native', () => {
	const React = jest.requireActual('react');
	function View({ testID, children, className }: any) {
		return React.createElement('div', { 'data-testid': testID, className }, children);
	}
	function Text({ testID, children, className }: any) {
		return React.createElement('span', { 'data-testid': testID, className }, children);
	}
	return { Platform: { OS: 'web' }, View, Text };
});
let mockPhone = false;
jest.mock('../lib/device', () => ({ useIsPhone: () => mockPhone }));
beforeEach(() => {
	mockPhone = false;
});
jest.mock('@rn-primitives/slot', () => ({ Slot: ({ children }: any) => children }));
jest.mock('../icon', () => ({
	Icon: ({ name, variant, loading }: any) =>
		React.createElement('i', { 'data-icon': name, 'data-variant': variant, 'data-busy': loading }),
}));
jest.mock('../progress', () => ({
	Progress: ({ testID, value, indeterminate }: any) =>
		React.createElement('div', {
			'data-testid': testID,
			'data-value': value,
			'data-indeterminate': indeterminate,
		}),
}));
jest.mock('../badge', () => ({
	Badge: ({ testID, children }: any) =>
		React.createElement('b', { 'data-testid': testID }, children),
}));

const icon = (container: HTMLElement) => container.querySelector('[data-icon]')!;

it('is a flush hairline row: the name and its tag, the identifiers and ONE caption state line', () => {
	render(
		<DeviceRow
			testID="row"
			icon="card"
			name="WisePad 3"
			tag="Stripe"
			identifiers={['WPC-1', null, '', 'London Shop']}
			state={{ label: 'Connected · 82%', tone: 'ok' }}
		/>
	);
	const row = screen.getByTestId('row');
	expect(row).toHaveClass('py-3', 'gap-3');
	// Alone, outside a list, it draws no rule at all.
	expect(row.className).not.toMatch(/rounded|bg-card|border/);
	expect(screen.getByText('WisePad 3')).toHaveClass('text-base', 'font-medium');
	expect(screen.getByTestId('row-tag')).toHaveTextContent('Stripe');
	// Blanks drop out of line 2, so no stray separator.
	expect(screen.getByTestId('row-identifiers')).toHaveTextContent(/^WPC-1 · London Shop$/);
	const state = screen.getByTestId('row-state');
	expect(state).toHaveTextContent('Connected · 82%');
	expect(state.querySelector('div')).toHaveClass('size-1.5', TONE.ok.dot);
});

it.each([
	['ok', 'ok'],
	['bad', 'bad'],
	['warning', 'muted'],
	['muted', 'muted'],
] as const)('tints the icon square by the state (%s → %s)', (tone, mark) => {
	const { container } = render(
		<DeviceRow icon="print" name="Printer" state={{ label: 'x', tone }} />
	);
	expect(icon(container)).toHaveAttribute('data-variant', mark);
	expect(icon(container).parentElement).toHaveClass(TONE[mark].tinted);
});

it('leaves out every line it is not given; the icon square is muted without a state', () => {
	const { container } = render(<DeviceRow testID="row" icon="print" name="Printer" />);
	expect(icon(container)).toHaveAttribute('data-variant', 'muted');
	expect(screen.queryByTestId('row-tag')).toBeNull();
	expect(screen.queryByTestId('row-identifiers')).toBeNull();
	expect(screen.queryByTestId('row-state')).toBeNull();
	expect(screen.queryByTestId('row-progress')).toBeNull();
});

it('names a caller state testID, spins the square while busy, and shows a known or unknown bar', () => {
	const { container, rerender } = render(
		<DeviceRow
			testID="row"
			icon="card"
			busy
			name="Reader"
			state={{ label: 'Installing', tone: 'muted', testID: 'row-line' }}
			progress={{ value: 46 }}
		/>
	);
	expect(screen.getByTestId('row-line')).toHaveTextContent('Installing');
	expect(icon(container)).toHaveAttribute('data-busy', 'true');
	expect(screen.getByTestId('row-progress')).toHaveAttribute('data-value', '46');
	rerender(<DeviceRow testID="row" name="Reader" progress={{}} />);
	expect(screen.getByTestId('row-progress')).toHaveAttribute('data-indeterminate', 'true');
});

it('rules a hairline between the rows of a list, never above the first or under the last', () => {
	render(
		<DeviceList>
			{['a', 'b', 'c'].map((id) => (
				<DeviceRow key={id} testID={id} name={id} />
			))}
			{null}
		</DeviceList>
	);
	expect(screen.getByTestId('a').className).not.toMatch(/border/);
	for (const id of ['b', 'c']) expect(screen.getByTestId(id)).toHaveClass('border-t');
	for (const id of ['a', 'b', 'c']) expect(screen.getByTestId(id)).not.toHaveClass('border-b');
});

it.each([
	[false, 'inline at the right of the name line'],
	[true, 'last, under the lines'],
])('phone=%s puts the actions %s, after what the row grows', (phone) => {
	mockPhone = phone;
	render(
		<DeviceRow testID="row" name="Reader">
			<DeviceRowActions>
				<button type="button">Connect</button>
			</DeviceRowActions>
			<span>hint</span>
		</DeviceRow>
	);
	const row = screen.getByTestId('row');
	const slot = screen.getByText('Connect').parentElement!;
	expect(slot).toHaveClass('flex-row', 'items-center');
	expect(slot.parentElement).toBe(phone ? row : row.firstElementChild);
	expect(row.lastElementChild).toBe(phone ? slot : screen.getByText('hint'));
});
