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
	duplicates: [
		{ till: TILL_A, counter: 44, orders: 2, order_ids: [23, 31], order_numbers: ['1023', '1031'] },
	],
	skew: [behindSkew],
	skew_counts: { ahead: 0, behind: 1 },
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
		'Till aaaaaaaa… — 2 sales numbered #44orders 1023, 1031'
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
		skew_counts: { ahead: 1, behind: 0 },
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
	// Closures are not windowed, so the passing row says what it covers.
	expect(screen.getByTestId('health-register-check-closures').textContent).toBe(
		'Closures numbered in orderCovers every closure, not only the last 30 days.'
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

it('does not say All checks passed for a clean register on a truncated report', () => {
	state.data = { ...state.data!, truncated: true };
	withRegisters({ ...clean, closure_gaps: [] });
	render(<RegistersPanel />);
	expect(screen.getByTestId('health-register-clean').textContent).toBe(
		'Checks passed for the newest salesOlder sales in the window were not checked.'
	);
	expect(register().textContent).not.toContain('All checks passed');
	expect(register().textContent).not.toContain('in order');
	expect(register().textContent).toContain('5 sales checked · counters 41–45');
});

it('claims only the sale checks on a clean register when the plugin sent no closure lists', () => {
	withRegisters(clean);
	render(<RegistersPanel />);
	expect(screen.getByTestId('health-register-clean').textContent).toBe(
		'All sale checks passedNumbers 41–45 in order'
	);
});

it('claims only the sale checks for the newest sales on a truncated report without closure lists', () => {
	state.data = { ...state.data!, truncated: true };
	withRegisters(clean);
	render(<RegistersPanel />);
	expect(screen.getByTestId('health-register-clean').textContent).toBe(
		'Sale checks passed for the newest salesOlder sales in the window were not checked.'
	);
});

it('omits the in-order sub on a clean register without counters', () => {
	withRegisters({ ...clean, first_counter: null, last_counter: null, closure_gaps: [] });
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

it('says No sales only among the newest sales checked on a truncated report', () => {
	state.data = { ...state.data!, truncated: true };
	withRegisters({ ...clean, orders: 0, first_counter: null, last_counter: null });
	render(<RegistersPanel />);
	expect(register().textContent).toContain('No sales among the newest sales checked');
	expect(register().textContent).not.toContain('No sales in the last');
});

it('scopes the sale checks’ pass titles to the newest sales on a truncated report', () => {
	state.data = { ...state.data!, truncated: true };
	// A failing duplicate puts the register in per-check view.
	withRegisters({
		...clean,
		duplicates: findings.duplicates,
		skew_counts: { ahead: 0, behind: 0 },
		closure_gaps: [],
	});
	render(<RegistersPanel />);
	expect(screen.getByTestId('health-register-check-gaps').textContent).toBe(
		'No skipped numbers among the newest sales'
	);
	expect(screen.getByTestId('health-register-check-clock').textContent).toBe(
		'Till clocks agree with your server for the newest sales'
	);
	// Closures are checked across all history, so their pass title stays exact.
	expect(screen.getByTestId('health-register-check-closures').textContent).toBe(
		'Closures numbered in orderCovers every closure, not only the last 30 days.'
	);
});

it('scopes the duplicates pass title to the newest sales on a truncated report', () => {
	state.data = { ...state.data!, truncated: true };
	withRegisters({ ...clean, gaps: [{ till: TILL_A, after: 1, before: 3, missing: 1 }] });
	render(<RegistersPanel />);
	expect(screen.getByTestId('health-register-check-duplicates').textContent).toBe(
		'No number used twice among the newest sales'
	);
});

it('names each till that restarted its counter once the duplicates check is opened', () => {
	withRegisters({
		...clean,
		duplicates: [
			{
				till: TILL_B,
				counter: 1,
				orders: 3,
				order_ids: [21, 22, 23],
				order_numbers: ['1021', '1022', '1023'],
			},
			{ till: TILL_A, counter: 1, orders: 2, order_ids: [11, 12], order_numbers: ['1011', '1012'] },
		],
	});
	render(<RegistersPanel />);
	const check = screen.getByTestId('health-register-check-duplicates');
	expect(check.textContent).toContain('Counter restarted on 2 tills');
	expect(check.textContent).toContain(
		'The same receipt number is on more than one sale. Nothing is lost.'
	);
	expect(check.querySelector('[data-icon="triangleExclamation"]')).not.toBeNull();
	expect(screen.queryAllByTestId('health-register-duplicate')).toHaveLength(0);
	open('duplicates');
	const rows = screen.getAllByTestId('health-register-duplicate');
	expect(rows.map((row) => row.textContent)).toEqual([
		'Till aaaaaaaa… — 2 sales numbered #1orders 1011, 1012',
		'Till bbbbbbbb… — 3 sales numbered #1orders 1021, 1022, 1023',
	]);
});

it('counts a repeated number exactly from the server total, and as a lower bound without it', () => {
	const ids = Array.from({ length: 20 }, (_, i) => 100 + i);
	withRegisters({
		...clean,
		orders: 1,
		duplicates: [
			// The server caps order ids at 20; `orders` is the true count.
			{ till: TILL_A, counter: 1, orders: 25, order_ids: ids, order_numbers: ids.map(String) },
			// An older plugin sends no `orders`: the capped sample is only a lower bound.
			{ till: TILL_B, counter: 2, order_ids: ids, order_numbers: ids.map(String) },
			{ till: 'till-1', counter: 3, order_ids: [7, 8], order_numbers: ['1007', '1008'] },
		],
	});
	render(<RegistersPanel />);
	expect(register().textContent).toContain('1 sale · counters');
	open('duplicates');
	const rows = screen.getAllByTestId('health-register-duplicate');
	expect(rows[0].textContent).toContain('Till aaaaaaaa… — 25 sales numbered #1');
	// 25 sales but 20 ids: the list is a sample and says so.
	expect(rows[0].textContent).toContain('e.g. orders 100, 101');
	expect(rows[1].textContent).toContain('Till bbbbbbbb… — at least 20 sales numbered #2');
	expect(rows[1].textContent).toContain('e.g. orders');
	expect(rows[2].textContent).toContain('No till recorded — at least 2 sales numbered #3');
	expect(rows[2].textContent).toContain('e.g. orders');
});

it('says No till recorded when the server fell back to the register id as the till', () => {
	withRegisters({
		...clean,
		gaps: [{ till: 'till-1', after: 3, before: 5, missing: 1 }],
		duplicates: [
			{ till: 'till-1', counter: 2, orders: 2, order_ids: [7, 8], order_numbers: ['1007', '1008'] },
		],
	});
	render(<RegistersPanel />);
	// The placeholder bucket is not a till, so the titles do not count it as one.
	expect(screen.getByTestId('health-register-check-gaps').textContent).toContain(
		'1 skipped number on sales with no till recorded'
	);
	expect(screen.getByTestId('health-register-check-duplicates').textContent).toContain(
		'Counter restarted on sales with no till recorded'
	);
	open('gaps');
	open('duplicates');
	expect(screen.getByTestId('health-register-gap').textContent).toBe(
		'No till recorded — 1 skipped between #3 and #5'
	);
	expect(screen.getByTestId('health-register-duplicate').textContent).toBe(
		'No till recorded — 2 sales numbered #2orders 1007, 1008'
	);
});

it('counts only real tills in the title when stamped and unstamped sales both repeat a number', () => {
	withRegisters({
		...clean,
		duplicates: [
			{ till: 'till-1', counter: 2, order_ids: [7, 8], order_numbers: ['1007', '1008'] },
			{ till: TILL_A, counter: 1, order_ids: [11, 12], order_numbers: ['1011', '1012'] },
		],
	});
	render(<RegistersPanel />);
	expect(screen.getByTestId('health-register-check-duplicates').textContent).toContain(
		'Counter restarted on 1 till'
	);
	open('duplicates');
	expect(screen.getAllByTestId('health-register-duplicate')).toHaveLength(2);
});

it('leaves deleted orders out of order lists and names them on skew rows', () => {
	withRegisters({
		...clean,
		duplicates: [
			{ till: TILL_A, counter: 2, orders: 2, order_ids: [7, 8], order_numbers: ['', '1008'] },
		],
		skew: [{ ...aheadSkew, order_number: '' }],
		skew_counts: { ahead: 1, behind: 0 },
	});
	render(<RegistersPanel />);
	open('duplicates');
	open('clock');
	expect(screen.getByTestId('health-register-duplicate').textContent).toBe(
		'Till aaaaaaaa… — 2 sales numbered #2orders 1008'
	);
	expect(screen.getByTestId('health-register-skew').textContent).toContain(
		'Deleted order 41: device'
	);
});

it('takes clock counts from skew_counts when the server sends them', () => {
	withRegisters({ ...clean, skew: [aheadSkew], skew_counts: { ahead: 31, behind: 0 } });
	const { unmount } = render(<RegistersPanel />);
	expect(screen.getByTestId('health-register-check-clock').textContent).toContain(
		'31 sales stamped by a clock running ahead'
	);
	unmount();
	withRegisters({ ...clean, skew: [behindSkew], skew_counts: { ahead: 0, behind: 12 } });
	render(<RegistersPanel />);
	expect(screen.getByTestId('health-register-check-clock').textContent).toContain(
		"12 sales were received later than their tills' time, usually offline sales synced later."
	);
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
	expect(screen.getByTestId('health-register-check-gaps').textContent).toContain(
		'A number was taken but the sale never completed. Nothing is lost.'
	);
	open('gaps');
	expect(screen.getAllByTestId('health-register-gap').map((row) => row.textContent)).toEqual([
		'Till aaaaaaaa… — 1 skipped between #1 and #3',
		'Till aaaaaaaa… — 3 skipped between #10 and #14',
		'Till bbbbbbbb… — 1 skipped between #2 and #4',
	]);
});

it('fails the clock check on a clock running ahead and lists only the ahead sales', () => {
	withRegisters({
		...clean,
		skew: [aheadSkew, behindSkew],
		skew_counts: { ahead: 1, behind: 1 },
	});
	render(<RegistersPanel />);
	const check = screen.getByTestId('health-register-check-clock');
	expect(check.textContent).toContain('1 sale stamped by a clock running ahead');
	// With skew_counts the count is exact.
	expect(check.textContent).not.toContain('At least');
	expect(check.textContent).toContain('Set the date and time on the till named below.');
	open('clock');
	expect(screen.getAllByTestId('health-register-skew').map((row) => row.textContent)).toEqual([
		'Order 1041: device 2026-09-11 03:00 +02:00, received 2026-09-10 23:00 UTC — 2.0 h ahead',
	]);
	// Every ahead sale is listed, so there is no "Showing n of N" line.
	expect(screen.queryByTestId('health-register-skew-sample-note')).toBeNull();
});

it('names the till on a skew row when the plugin sends it', () => {
	withRegisters({
		...clean,
		skew: [
			{ ...aheadSkew, till: TILL_A },
			// The register id is the server's fallback for a sale without a till stamp.
			{ ...aheadSkew, order_id: 42, order_number: '1042', till: 'till-1' },
			// An older plugin sends no till.
			{ ...aheadSkew, order_id: 43, order_number: '1043' },
		],
		skew_counts: { ahead: 3, behind: 0 },
	});
	render(<RegistersPanel />);
	open('clock');
	expect(screen.getAllByTestId('health-register-skew').map((row) => row.textContent)).toEqual([
		'Till aaaaaaaa… — Order 1041: device 2026-09-11 03:00 +02:00, received 2026-09-10 23:00 UTC — 2.0 h ahead',
		'No till recorded — Order 1042: device 2026-09-11 03:00 +02:00, received 2026-09-10 23:00 UTC — 2.0 h ahead',
		'Order 1043: device 2026-09-11 03:00 +02:00, received 2026-09-10 23:00 UTC — 2.0 h ahead',
	]);
});

it('says how many of a capped direction the expanded list shows', () => {
	withRegisters({ ...clean, skew: [aheadSkew], skew_counts: { ahead: 31, behind: 0 } });
	const { unmount } = render(<RegistersPanel />);
	open('clock');
	expect(screen.getByTestId('health-register-skew-sample-note').textContent).toBe(
		'Showing 1 of 31 sales'
	);
	unmount();
	withRegisters({ ...clean, skew: [behindSkew], skew_counts: { ahead: 0, behind: 12 } });
	render(<RegistersPanel />);
	open('clock');
	expect(screen.getByTestId('health-register-skew-sample-note').textContent).toBe(
		'Showing 1 of 12 sales'
	);
});

it('passes the clock check on behind-only sales without claiming the clocks agree', () => {
	withRegisters({ ...clean, skew: [behindSkew], skew_counts: { ahead: 0, behind: 1 } });
	render(<RegistersPanel />);
	const check = screen.getByTestId('health-register-check-clock');
	// A late sale is usually offline, but the payload cannot rule out a clock running behind.
	expect(check.textContent).toBe(
		"No till clock runs ahead1 sale was received later than its till's time, usually an offline sale synced later."
	);
	expect(check.querySelector('[data-icon="circleCheck"]')).not.toBeNull();
	open('clock');
	expect(screen.getAllByTestId('health-register-skew')).toHaveLength(1);
});

it('says the till clocks agree only when no sale is out of step, with or without skew_counts', () => {
	const gaps = [{ till: TILL_A, after: 1, before: 3, missing: 1 }];
	withRegisters({ ...clean, gaps, skew_counts: { ahead: 0, behind: 0 } });
	const { unmount } = render(<RegistersPanel />);
	expect(screen.getByTestId('health-register-check-clock').textContent).toBe(
		'Till clocks agree with your server'
	);
	unmount();
	// An older plugin with nothing to sample: nothing was skewed.
	withRegisters({ ...clean, gaps });
	render(<RegistersPanel />);
	expect(screen.getByTestId('health-register-check-clock').textContent).toBe(
		'Till clocks agree with your server'
	);
});

it('shows an older plugin’s behind-only skew sample as a neutral row', () => {
	withRegisters({ ...clean, skew: [behindSkew] });
	render(<RegistersPanel />);
	const check = screen.getByTestId('health-register-check-clock');
	expect(check.textContent).toBe(
		"Till clocks: only a sample was checkedUpdate the POS plugin to check every sale's clock."
	);
	expect(check.querySelector('[data-icon="circleInfo"]')).not.toBeNull();
	expect(check.querySelector('[data-icon="circleCheck"]')).toBeNull();
	expect(check.querySelector('[data-icon="triangleExclamation"]')).toBeNull();
	open('clock');
	expect(screen.getAllByTestId('health-register-skew').map((row) => row.textContent)).toEqual([
		'Order 1040: device 2026-09-11 00:42 +02:00, received 2026-09-10 22:42 UTC — 119 min behind',
	]);
});

it('fails an older plugin’s sample on an ahead row, with the amber running-ahead row', () => {
	// One ahead row proves a clock is ahead however the sample was cut; its count is a lower bound.
	withRegisters({ ...clean, skew: [behindSkew, aheadSkew] });
	render(<RegistersPanel />);
	expect(checkIds()[0]).toBe('health-register-check-clock');
	const check = screen.getByTestId('health-register-check-clock');
	expect(check.textContent).toContain('At least 1 sale stamped by a clock running ahead');
	expect(check.querySelector('[data-icon="triangleExclamation"]')).not.toBeNull();
	expect(check.querySelector('[data-icon="circleInfo"]')).toBeNull();
	open('clock');
	expect(screen.getAllByTestId('health-register-skew').map((row) => row.textContent)).toEqual([
		'Order 1041: device 2026-09-11 03:00 +02:00, received 2026-09-10 23:00 UTC — 2.0 h ahead',
	]);
});

it('omits the closures check when the plugin sends no closure lists', () => {
	withRegisters({ ...clean, skew: [aheadSkew] });
	render(<RegistersPanel />);
	expect(screen.queryByTestId('health-register-check-closures')).toBeNull();
});

it('fails the closures check from whichever closure list is non-empty', () => {
	withRegisters({
		...clean,
		// Newest-first, with the leading gap appended last, as the server pages them.
		closure_gaps: [
			{ after: 2, before: 5, missing: 2 },
			{ after: 0, before: 2, missing: 1 },
		],
		closure_conflicts: [{ id: 'c-7', number: 7, printed_number: 8 }],
	});
	render(<RegistersPanel />);
	const check = screen.getByTestId('health-register-check-closures');
	expect(check.textContent).toContain(
		'3 closure numbers skipped · 1 closure printed with a different number'
	);
	expect(check.textContent).toContain(
		'Closures are never renumbered. This check covers every closure, not only the last 30 days.'
	);
	open('closures');
	expect(screen.getAllByTestId('health-register-closure').map((row) => row.textContent)).toEqual([
		'Closure #1 is missing',
		'2 skipped between closure #2 and #5',
		'Closure #7 was printed as #8',
	]);
});

it('names the run of missing first closures when several are missing', () => {
	withRegisters({ ...clean, closure_gaps: [{ after: 0, before: 4, missing: 3 }] });
	render(<RegistersPanel />);
	open('closures');
	expect(screen.getByTestId('health-register-closure').textContent).toBe(
		'Closures #1–#3 are missing'
	);
});

it('notes a truncated report under the header, scoping every count below it', () => {
	state.data = { ...state.data!, truncated: true };
	withRegisters({ ...findings, closure_gaps: [] });
	render(<RegistersPanel />);
	expect(screen.getByTestId('health-registers-truncated').textContent).toBe(
		'Only the newest sales were checked; older sales in the window were skipped. Every sale count below is for the sales that were checked; closures are always checked in full.'
	);
	// The register's own summary says it counts the sales checked, not the whole window.
	expect(register().textContent).toContain('5 sales checked · counters 41–45');
	expect(register().textContent).not.toContain('5 sales · counters');
});

it('leaves the closures clause out of the truncation note when the plugin sends no closure lists', () => {
	state.data = { ...state.data!, truncated: true };
	render(<RegistersPanel />);
	expect(screen.getByTestId('health-registers-truncated').textContent).toBe(
		'Only the newest sales were checked; older sales in the window were skipped. Every count below is for the sales that were checked.'
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
		'Nothing is lost. Register the till under POS settings › Registers.'
	);
	expect(screen.getByTestId('health-unregistered').textContent).toContain(
		'12345678… — 3 sales, e.g. orders 1001, 1002'
	);
});

it('pluralises an unregistered till and leaves deleted orders out', () => {
	state.data = {
		...state.data!,
		unregistered: [
			{ register_id: 'aaaaaaaa-one', orders: 1, order_ids: [1], order_numbers: ['1001'] },
			{ register_id: 'bbbbbbbb-gone', orders: 2, order_ids: [2, 3], order_numbers: ['', ''] },
			{ register_id: 'cccccccc-mix', orders: 2, order_ids: [4, 5], order_numbers: ['', '1005'] },
		],
	};
	render(<RegistersPanel />);
	expect(screen.getAllByTestId('health-unregistered-row').map((row) => row.textContent)).toEqual([
		'aaaaaaaa… — 1 sale, e.g. order 1001',
		'bbbbbbbb… — 2 sales',
		'cccccccc… — 2 sales, e.g. orders 1005',
	]);
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
