/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { RegistersPanel } from './registers-panel';

import type { RegisterHealth, useRegisterHealth } from './use-register-health';

type Props = {
	children?: React.ReactNode;
	testID?: string;
	disabled?: boolean;
	onPress?: () => void;
};
jest.mock('@wcpos/components/button', () => ({
	Button: ({ children, testID, disabled, onPress }: Props) => (
		<button type="button" data-testid={testID} disabled={disabled} onClick={onPress}>
			{children}
		</button>
	),
	ButtonText: ({ children }: Props) => <>{children}</>,
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children, testID }: Props) => <div data-testid={testID}>{children}</div>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, testID }: Props) => <span data-testid={testID}>{children}</span>,
}));
jest.mock('./components/pill', () => ({
	Pill: ({ children }: Props) => <span>{children}</span>,
}));
jest.mock('./components/section', () => ({
	Section: ({ children, testID, title }: Props & { title: string }) => (
		<section data-testid={testID}>
			<h2>{title}</h2>
			{children}
		</section>
	),
}));
jest.mock('../../../contexts/translations', () => {
	const { createTestT } = jest.requireActual<typeof import('../../../../jest/translate')>(
		'../../../../jest/translate'
	);
	return { useT: () => createTestT() };
});
let state: ReturnType<typeof useRegisterHealth>;
jest.mock('./use-register-health', () => ({ useRegisterHealth: () => state }));

const register: RegisterHealth['registers'][number] = {
	id: 'till-1',
	name: 'Front counter',
	orders: 5,
	first_counter: 41,
	last_counter: 44,
	gaps: [{ after: 41, before: 43, missing: 1 }],
	duplicates: [{ counter: 44, order_ids: [23, 31], order_numbers: ['1023', '1031'] }],
	skew: [
		{
			order_id: 40,
			order_number: '1040',
			sale_time: '2026-09-11T00:42:00+02:00',
			received_gmt: '2026-09-10T22:42:00Z',
			skew_seconds: 7140,
			direction: 'behind',
		},
	],
};
beforeEach(() => {
	state = {
		data: { window_days: 30, skew_seconds: 600, registers: [register], unregistered: [] },
		loading: false,
		error: null,
		refresh: jest.fn(),
	};
});

it('renders each finding using counters, order numbers, and the shared skew magnitude', () => {
	render(<RegistersPanel />);
	expect(screen.getByTestId('health-registers').textContent).toContain('Registers');
	expect(screen.getByTestId('health-register-till-1').textContent).toContain('Front counter');
	expect(screen.getByTestId('health-register-till-1').textContent).toContain(
		'5 sales in the last 30 days · counters 41–44'
	);
	expect(screen.getByTestId('health-register-gap').textContent).toBe(
		'after #41, before #43 — 1 missing'
	);
	expect(screen.getByTestId('health-register-duplicate').textContent).toBe(
		'#44 on orders 1023, 1031'
	);
	expect(screen.getByTestId('health-register-skew').textContent).toBe(
		'Order 1040: device 2026-09-11 00:42 +02:00, received 2026-09-10 22:42 UTC — 119 min behind'
	);
	expect(screen.getByTestId('health-registers').textContent).toContain(
		'usually an offline sale synced later'
	);
});

it('shows No findings for a clean register without finding headings', () => {
	state.data = { ...state.data!, registers: [{ ...register, gaps: [], duplicates: [], skew: [] }] };
	render(<RegistersPanel />);
	expect(screen.getByTestId('health-register-till-1').textContent).toContain('No findings');
	expect(screen.getByTestId('health-register-till-1').textContent).not.toMatch(
		/Gaps|Duplicates|Clock/
	);
});

it('renders unregistered tills with their count and example order numbers', () => {
	state.data = {
		...state.data!,
		unregistered: [
			{
				register_id: '12345678-abcd',
				orders: 3,
				order_ids: [1, 2],
				order_numbers: ['1001', '1002'],
			},
		],
	};
	render(<RegistersPanel />);
	expect(screen.getByTestId('health-unregistered').textContent).toContain('Unregistered tills');
	expect(screen.getByTestId('health-unregistered').textContent).toContain(
		'12345678… — 3 sales, e.g. orders 1001, 1002'
	);
});

it('renders an error line and allows refresh', () => {
	state = { ...state, data: null, error: 'Store unavailable' };
	render(<RegistersPanel />);
	expect(screen.getByTestId('health-registers-error').textContent).toBe(
		'Could not load registers: Store unavailable'
	);
	fireEvent.click(screen.getByTestId('health-registers-refresh'));
	expect(state.refresh).toHaveBeenCalledTimes(1);
});

it('shows loading and disables refresh while fetching', () => {
	state = { ...state, data: null, loading: true };
	render(<RegistersPanel />);
	expect(screen.getByTestId('health-registers').textContent).toContain('Loading...');
	fireEvent.click(screen.getByTestId('health-registers-refresh'));
	expect(state.refresh).not.toHaveBeenCalled();
});
