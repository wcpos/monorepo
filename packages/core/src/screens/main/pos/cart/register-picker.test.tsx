/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen, within } from '@testing-library/react';

import type { StatusBadgeProps } from '@wcpos/components/status-badge';

import { RegisterPicker } from './register-picker';

const rows = [
	{
		id: 'open',
		name: 'Front',
		session: {
			id: 'session-1',
			status: 'open',
			opened_at_gmt: '2026-10-21T08:15:00Z',
			opened_by: { id: 7, name: 'Pat' },
		},
		last_closure: null,
	},
	{
		id: 'counting',
		name: 'Back',
		session: {
			id: 'session-2',
			status: 'counting',
			opened_at_gmt: '2026-10-21T09:00:00Z',
			opened_by: { id: 8, name: 'Sam' },
		},
		last_closure: null,
	},
	{
		id: 'closed',
		name: 'Side',
		session: null,
		last_closure: { number: 12, closed_at_gmt: '2026-10-20T16:30:00Z' },
	},
	{
		id: 'legacy',
		name: 'Legacy',
		session: null,
		last_closure: { number: 11, closed_at_gmt: null },
	},
];
let mockRegisters: {
	id: string;
	name: string;
	session?: (typeof rows)[number]['session'];
	last_closure?: (typeof rows)[number]['last_closure'];
}[] = rows;
const mockBind = jest.fn(async (_id: string): Promise<void> => undefined);
const mockRefresh = jest.fn(async (): Promise<void> => undefined);
const mockT = jest.fn((key: string, params?: Record<string, unknown>) =>
	params ? `${key} ${JSON.stringify(params)}` : key
);
const mockDateFormat = jest.fn((_date: unknown, pattern: string, _fromNow: boolean) =>
	pattern === 'p' ? '10:15' : 'Oct 20, 6:30 PM'
);
jest.mock('../../../../services/register/use-register-binding', () => ({
	useRegisterBinding: () => ({ registers: mockRegisters, bind: mockBind, refresh: mockRefresh }),
}));
jest.mock('../../../../contexts/translations', () => ({ useT: () => mockT }));
jest.mock('../../hooks/use-date-format', () => ({
	useDateFormat: (...args: Parameters<typeof mockDateFormat>) => mockDateFormat(...args),
}));
jest.mock('@wcpos/components/icon', () => ({
	Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));
jest.mock('@wcpos/components/status-badge', () => ({
	StatusBadge: ({ label, variant }: StatusBadgeProps) => (
		<span data-variant={variant}>{label}</span>
	),
}));

beforeEach(() => {
	jest.clearAllMocks();
	mockRegisters = rows;
	mockBind.mockResolvedValue(undefined);
});

it('renders open, counting and last-closure labels with their params and tones', () => {
	render(<RegisterPicker />);
	const open = screen.getByTestId('register-picker-row-open');
	expect(within(open).getByText('Front')).toBeTruthy();
	expect(within(open).getByTestId('icon-chevronRight')).toBeTruthy();
	expect(
		within(open)
			.getByText('register.open_since_by {"time":"10:15","name":"Pat"}')
			.getAttribute('data-variant')
	).toBe('ok');
	expect(
		within(screen.getByTestId('register-picker-row-counting'))
			.getByText('register.counting_by {"name":"Sam"}')
			.getAttribute('data-variant')
	).toBe('warning');
	expect(
		within(screen.getByTestId('register-picker-row-closed'))
			.getByText('register.closed_last_closure {"number":12,"date":"Oct 20, 6:30 PM"}')
			.getAttribute('data-variant')
	).toBe('muted');
	expect(mockDateFormat).toHaveBeenCalledWith('2026-10-21T08:15:00Z', 'p', false);
	expect(mockDateFormat).toHaveBeenCalledWith('2026-10-20T16:30:00Z', 'MMM d, p', false);
});

it('refreshes once on mount', () => {
	render(<RegisterPicker />);
	expect(mockRefresh).toHaveBeenCalledTimes(1);
});

it('renders plain Closed for a closure without a date', () => {
	render(<RegisterPicker />);
	expect(
		within(screen.getByTestId('register-picker-row-legacy'))
			.getByText('register.closed')
			.getAttribute('data-variant')
	).toBe('muted');
});

it.each([undefined, null])('renders Closed when session and closure are %s', (value) => {
	mockRegisters = [{ id: 'empty', name: 'Empty', session: value, last_closure: value }];
	render(<RegisterPicker />);
	expect(screen.getByText('register.closed').getAttribute('data-variant')).toBe('muted');
});

it.each([0, 1])('uses the unknown cashier label for an empty actor name on row %s', (index) => {
	const row = rows[index];
	mockRegisters = [{ ...row, session: { ...row.session!, opened_by: { id: 7, name: '' } } }];
	render(<RegisterPicker />);
	expect(mockT).toHaveBeenCalledWith(
		index === 0 ? 'register.open_since_by' : 'register.counting_by',
		expect.objectContaining({ name: 'register.unknown_cashier' })
	);
});

it('waits for binding the tapped id before calling onBound', async () => {
	let finishBind!: () => void;
	mockBind.mockReturnValueOnce(
		new Promise<void>((resolve) => {
			finishBind = resolve;
		})
	);
	const onBound = jest.fn();
	render(<RegisterPicker onBound={onBound} />);
	fireEvent.click(screen.getByTestId('register-picker-row-counting'));
	expect(mockBind).toHaveBeenCalledWith('counting');
	expect(onBound).not.toHaveBeenCalled();
	await act(async () => {
		finishBind();
	});
	expect(onBound).toHaveBeenCalledTimes(1);
});

it('renders the title and footer without the old Card header text', () => {
	render(<RegisterPicker />);
	expect(screen.getByText('register.which_register')).toBeTruthy();
	const footer = screen.getByText('register.change_later_from_avatar');
	expect(screen.getByTestId('register-picker-row-legacy').nextElementSibling).toBe(footer);
	expect(screen.queryByText('register.choose_register')).toBeNull();
});
