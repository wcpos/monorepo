import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { TONE } from '../lib/tone';
import { DeviceRow, DeviceRowActions } from './index';

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

it('stacks the name and its tag, the identifiers and ONE caption state line on a row card', () => {
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
	expect(screen.getByTestId('row')).toHaveClass('bg-card', 'rounded-lg', 'border', 'p-3');
	expect(screen.getByText('WisePad 3')).toHaveClass('text-lg', 'font-semibold');
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

it('puts the actions last, on a full-width row of their own', () => {
	render(
		<DeviceRow testID="row" name="Reader">
			<span>hint</span>
			<DeviceRowActions>
				<button type="button">Connect</button>
			</DeviceRowActions>
		</DeviceRow>
	);
	const card = screen.getByTestId('row');
	const slot = card.lastElementChild!;
	expect(slot).toHaveClass('w-full', 'flex-row');
	expect(slot).toHaveTextContent('Connect');
	expect(slot.previousElementSibling).toHaveTextContent('hint');
});
