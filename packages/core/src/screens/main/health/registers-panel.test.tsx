/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen, within } from '@testing-library/react';

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
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children, testID }: Props) => <div data-testid={testID}>{children}</div>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, testID }: Props) => <span data-testid={testID}>{children}</span>,
}));
jest.mock('@wcpos/components/icon', () => ({
	Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}));
// Plain elements: the trigger is a button that toggles whether the content renders.
jest.mock('@wcpos/components/collapsible', () => {
	const ReactActual = jest.requireActual<typeof import('react')>('react');
	const OpenContext = ReactActual.createContext<{ open: boolean; toggle: () => void }>({
		open: false,
		toggle: () => {},
	});
	return {
		Collapsible: ({ children, testID }: Props) => {
			const [open, setOpen] = ReactActual.useState(false);
			return (
				<OpenContext.Provider value={{ open, toggle: () => setOpen((value) => !value) }}>
					<div data-testid={testID}>{children}</div>
				</OpenContext.Provider>
			);
		},
		CollapsibleTrigger: ({ children, testID }: Props) => {
			const { toggle } = ReactActual.useContext(OpenContext);
			return (
				<button type="button" data-testid={testID} onClick={toggle}>
					{children}
				</button>
			);
		},
		CollapsibleContent: ({ children }: Props) => {
			const { open } = ReactActual.useContext(OpenContext);
			return open ? <div>{children}</div> : null;
		},
	};
});
jest.mock('./components/section', () => ({
	Section: ({
		children,
		testID,
		title,
		sub,
		action,
	}: Props & { title: string; sub?: string; action?: React.ReactNode }) => (
		<section data-testid={testID}>
			<h2>{title}</h2>
			{sub ? <p data-testid="section-sub">{sub}</p> : null}
			{action}
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

type Register = RegisterHealth['registers'][number];

const TILL_A = 'aaaaaaaa-1111-4000-8000-000000000001';
const TILL_B = 'bbbbbbbb-2222-4000-8000-000000000002';

const clean: Register = {
	id: 'till-1',
	name: 'Front counter',
	orders: 5,
	first_counter: 41,
	last_counter: 45,
	gaps: [],
	duplicates: [],
	skew: [],
};
const behindSkew: Register['skew'][number] = {
	order_id: 40,
	order_number: '1040',
	sale_time: '2026-09-11T00:42:00+02:00',
	received_gmt: '2026-09-10T22:42:00Z',
	skew_seconds: -7140,
	direction: 'behind',
};
const aheadSkew: Register['skew'][number] = {
	order_id: 41,
	order_number: '1041',
	sale_time: '2026-09-11T03:00:00+02:00',
	received_gmt: '2026-09-10T23:00:00Z',
	skew_seconds: 7200,
	direction: 'ahead',
};
const findings: Register = {
	...clean,
	gaps: [{ till: TILL_A, after: 41, before: 43, missing: 1 }],
	duplicates: [{ till: TILL_A, counter: 44, order_ids: [23, 31], order_numbers: ['1023', '1031'] }],
	skew: [behindSkew],
};

function withRegisters(...registers: Register[]) {
	state.data = { ...state.data!, registers };
}
function register() {
	return screen.getByTestId('health-register-till-1');
}
function checkIds() {
	return within(register())
		.queryAllByTestId(/^health-register-check-[a-z]+$/)
		.map((element) => element.getAttribute('data-testid'));
}
function open(kind: string) {
	fireEvent.click(within(register()).getByTestId(`health-register-check-${kind}-trigger`));
}

beforeEach(() => {
	state = {
		data: {
			window_days: 30,
			skew_seconds: 600,
			truncated: false,
			registers: [findings],
			unregistered: [],
			unknown_sessions: [],
		},
		loading: false,
		error: null,
		refresh: jest.fn(),
	};
});

it('renders each finding using tills, counters, order numbers, and the shared skew magnitude', () => {
	render(<RegistersPanel />);
	expect(screen.getByTestId('health-registers').textContent).toContain('Registers');
	expect(screen.getByTestId('section-sub').textContent).toBe(
		'Receipt numbering on each till, last 30 days'
	);
	expect(register().textContent).toContain('Front counter');
	expect(register().textContent).toContain('5 sales · counters 41–45');
	open('gaps');
	expect(screen.getByTestId('health-register-gap').textContent).toBe(
		'Till aaaaaaaa… — 1 skipped between #41 and #43'
	);
	open('duplicates');
	expect(screen.getByTestId('health-register-duplicate').textContent).toBe(
		'Till aaaaaaaa… — #44 on 2 salesorders 1023, 1031'
	);
	open('clock');
	expect(screen.getByTestId('health-register-skew').textContent).toBe(
		'Order 1040: device 2026-09-11 00:42 +02:00, received 2026-09-10 22:42 UTC — 119 min behind'
	);
});

it('lists failing checks first, in the order gaps, duplicates, clock, closures', () => {
	withRegisters({
		...clean,
		duplicates: findings.duplicates,
		skew: [aheadSkew],
		closure_gaps: [],
		closure_conflicts: [],
		closure_total_mismatches: [],
	});
	render(<RegistersPanel />);
	expect(checkIds()).toEqual([
		'health-register-check-duplicates',
		'health-register-check-clock',
		'health-register-check-gaps',
		'health-register-check-closures',
	]);
	// A passing row is not pressable and has no chevron.
	expect(within(register()).queryByTestId('health-register-check-gaps-trigger')).toBeNull();
	expect(screen.getByTestId('health-register-check-gaps').textContent).toBe('No skipped numbers');
	expect(screen.getByTestId('health-register-check-closures').textContent).toBe(
		'Closures numbered in order'
	);
});

it('keys findings two tills of one register report alike without a duplicate-key warning', () => {
	// The server summarises each till on its own and flattens: a register shared by two
	// tills reports counter 1 twice and the same gap twice (web, 2026-10-18).
	withRegisters({
		...findings,
		gaps: [
			{ till: TILL_B, after: 1, before: 3, missing: 1 },
			{ till: TILL_A, after: 1, before: 3, missing: 1 },
		],
		duplicates: [
			{
				till: TILL_B,
				counter: 1,
				order_ids: [21, 22, 23],
				order_numbers: ['1021', '1022', '1023'],
			},
			{ till: TILL_A, counter: 1, order_ids: [11, 12], order_numbers: ['1011', '1012'] },
		],
	});
	const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
	try {
		render(<RegistersPanel />);
		open('gaps');
		open('duplicates');
		expect(screen.getAllByTestId('health-register-gap')).toHaveLength(2);
		expect(screen.getAllByTestId('health-register-duplicate')).toHaveLength(2);
		const keyWarnings = consoleError.mock.calls.filter((call) =>
			String(call[0]).includes('same key')
		);
		expect(keyWarnings).toHaveLength(0);
	} finally {
		consoleError.mockRestore();
	}
});

it('shows one All checks passed row for a clean register and no check rows', () => {
	withRegisters({
		...clean,
		closure_gaps: [],
		closure_conflicts: [],
		closure_total_mismatches: [],
	});
	render(<RegistersPanel />);
	expect(checkIds()).toEqual([]);
	expect(screen.getByTestId('health-register-clean').textContent).toBe(
		'All checks passedNumbers 41–45 in order'
	);
	expect(
		screen.getByTestId('health-register-clean').querySelector('[data-icon="circleCheck"]')
	).not.toBeNull();
	expect(screen.queryByTestId('health-register-clean-trigger')).toBeNull();
});

it('omits the in-order sub on a clean register without counters', () => {
	withRegisters({ ...clean, first_counter: null, last_counter: null });
	render(<RegistersPanel />);
	expect(screen.getByTestId('health-register-clean').textContent).toBe('All checks passed');
});

it('says No sales and lists no checks for a register without sales in the window', () => {
	withRegisters({ ...clean, orders: 0, first_counter: null, last_counter: null });
	render(<RegistersPanel />);
	expect(register().textContent).toContain('No sales in the last 30 days');
	expect(checkIds()).toEqual([]);
	expect(screen.queryByTestId('health-register-clean')).toBeNull();
});

it('names each till that restarted its counter once the duplicates check is opened', () => {
	withRegisters({
		...clean,
		duplicates: [
			{
				till: TILL_B,
				counter: 1,
				order_ids: [21, 22, 23],
				order_numbers: ['1021', '1022', '1023'],
			},
			{ till: TILL_A, counter: 1, order_ids: [11, 12], order_numbers: ['1011', '1012'] },
		],
	});
	render(<RegistersPanel />);
	const check = screen.getByTestId('health-register-check-duplicates');
	expect(check.textContent).toContain('Counter restarted on 2 tills');
	expect(check.querySelector('[data-icon="triangleExclamation"]')).not.toBeNull();
	expect(screen.queryAllByTestId('health-register-duplicate')).toHaveLength(0);
	open('duplicates');
	const rows = screen.getAllByTestId('health-register-duplicate');
	expect(rows.map((row) => row.textContent)).toEqual([
		'Till aaaaaaaa… — #1 on 2 salesorders 1011, 1012',
		'Till bbbbbbbb… — #1 on 3 salesorders 1021, 1022, 1023',
	]);
});

it('says "or more" when a finding holds exactly the server sample cap, and pluralises one sale', () => {
	const ids = Array.from({ length: 20 }, (_, i) => 100 + i);
	withRegisters({
		...clean,
		orders: 1,
		duplicates: [
			{ till: TILL_A, counter: 1, order_ids: ids, order_numbers: ids.map(String) },
			{ till: TILL_B, counter: 2, order_ids: [7], order_numbers: ['1007'] },
		],
	});
	render(<RegistersPanel />);
	expect(register().textContent).toContain('1 sale · counters');
	open('duplicates');
	const rows = screen.getAllByTestId('health-register-duplicate');
	expect(rows[0].textContent).toContain('Till aaaaaaaa… — #1 on 20 or more sales');
	expect(rows[1].textContent).toContain('Till bbbbbbbb… — #2 on 1 sale');
});

it('sums missing numbers across gaps and counts the tills they are on', () => {
	withRegisters({
		...clean,
		gaps: [
			{ till: TILL_A, after: 10, before: 14, missing: 3 },
			{ till: TILL_B, after: 2, before: 4, missing: 1 },
			{ till: TILL_A, after: 1, before: 3, missing: 1 },
		],
	});
	render(<RegistersPanel />);
	expect(screen.getByTestId('health-register-check-gaps').textContent).toContain(
		'5 skipped numbers on 2 tills'
	);
	open('gaps');
	expect(screen.getAllByTestId('health-register-gap').map((row) => row.textContent)).toEqual([
		'Till aaaaaaaa… — 1 skipped between #1 and #3',
		'Till aaaaaaaa… — 3 skipped between #10 and #14',
		'Till bbbbbbbb… — 1 skipped between #2 and #4',
	]);
});

it('fails the clock check on a clock running ahead and lists only the ahead sales', () => {
	withRegisters({ ...clean, skew: [aheadSkew, behindSkew] });
	render(<RegistersPanel />);
	const check = screen.getByTestId('health-register-check-clock');
	expect(check.textContent).toContain('1 sale stamped by a clock running ahead');
	expect(check.textContent).toContain('Set the date and time on the device.');
	open('clock');
	expect(screen.getAllByTestId('health-register-skew').map((row) => row.textContent)).toEqual([
		'Order 1041: device 2026-09-11 03:00 +02:00, received 2026-09-10 23:00 UTC — 2.0 h ahead',
	]);
});

it('passes the clock check on behind-only sales and keeps them one tap away', () => {
	withRegisters({ ...clean, skew: [behindSkew] });
	render(<RegistersPanel />);
	const check = screen.getByTestId('health-register-check-clock');
	expect(check.textContent).toContain('Till clocks agree with your server');
	expect(check.textContent).toContain(
		'1 offline sale synced later than it was made. Nothing to do.'
	);
	expect(check.querySelector('[data-icon="circleCheck"]')).not.toBeNull();
	open('clock');
	expect(screen.getAllByTestId('health-register-skew')).toHaveLength(1);
});

it('omits the closures check when the plugin sends no closure lists', () => {
	withRegisters({ ...clean, skew: [aheadSkew] });
	render(<RegistersPanel />);
	expect(screen.queryByTestId('health-register-check-closures')).toBeNull();
});

it('fails the closures check from whichever closure list is non-empty', () => {
	withRegisters({
		...clean,
		closure_gaps: [{ after: 2, before: 5, missing: 2 }],
		closure_conflicts: [{ id: 'c-7', number: 7, printed_number: 8 }],
	});
	render(<RegistersPanel />);
	const check = screen.getByTestId('health-register-check-closures');
	expect(check.textContent).toContain(
		'2 closure numbers skipped · 1 closure printed with a different number'
	);
	open('closures');
	expect(screen.getAllByTestId('health-register-closure').map((row) => row.textContent)).toEqual([
		'2 skipped between closure #2 and #5',
		'Closure #7 was printed as #8',
	]);
});

it('notes a truncated report under the header', () => {
	state.data = { ...state.data!, truncated: true };
	render(<RegistersPanel />);
	expect(screen.getByTestId('health-registers-truncated').textContent).toBe(
		'Only the newest sales were checked; older sales in the window were skipped.'
	);
});

it('omits the truncated note on a complete report', () => {
	render(<RegistersPanel />);
	expect(screen.queryByTestId('health-registers-truncated')).toBeNull();
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
	expect(screen.getByTestId('health-unregistered').textContent).toContain(
		"Sales from tills this store hasn't registered"
	);
	expect(screen.getByTestId('health-unregistered').textContent).toContain(
		'Register the till under POS settings › Registers in WP Admin.'
	);
	expect(screen.getByTestId('health-unregistered').textContent).toContain(
		'12345678… — 3 sales, e.g. orders 1001, 1002'
	);
});

it('summarises sales naming an unknown register session in one line', () => {
	state.data = {
		...state.data!,
		unknown_sessions: [
			{ session_id: 's-1', orders: 2, order_ids: [1, 2] },
			{ session_id: 's-2', orders: 1, order_ids: [3] },
		],
	};
	render(<RegistersPanel />);
	expect(screen.getByTestId('health-unknown-sessions').textContent).toBe(
		'3 sales name a register session this store has no record of.'
	);
});

it('omits the unknown sessions line when every session is known', () => {
	render(<RegistersPanel />);
	expect(screen.queryByTestId('health-unknown-sessions')).toBeNull();
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

it('keeps the last report on screen while a refresh is loading', () => {
	state = { ...state, loading: true };
	render(<RegistersPanel />);
	expect(screen.getByTestId('health-registers').textContent).toContain('Loading...');
	expect(register()).not.toBeNull();
});
