/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { backToSelling as resumeSelling, startCounting } from '@wcpos/query/register-session';

import * as audit from '../../../../services/register-session/audit';
import { createTestT } from '../../../../../jest/translate';
import { RegisterCount } from './register-count';
// RN-web drops className without Uniwind; retain the View's token classes for band assertions.
jest.mock('react-native', () => {
	const native = jest.requireActual('react-native');
	return {
		...native,
		View: ({
			className,
			...props
		}: React.ComponentProps<typeof import('react-native').View> & {
			dataSet?: Record<string, string>;
		}) => <native.View {...props} dataSet={{ ...props.dataSet, classes: className }} />,
	};
});
// Keep FormLabel and its form context real; the native primitive ships unbound JSX in Jest.
jest.mock('@rn-primitives/label', () => ({
	Text: ({ children, nativeID }: React.PropsWithChildren<{ nativeID?: string }>) => (
		<span id={nativeID}>{children}</span>
	),
}));
jest.mock('@wcpos/utils/open-external-url', () => ({ openExternalURL: jest.fn() }));
jest.mock('../../../../contexts/translations', () => ({ useT: () => createTestT() }));
jest.mock('../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ currencySymbol: '£', format: (n: number) => `£${n.toFixed(2)}` }),
}));
jest.mock('../../../../services/register-session/audit', () => ({
	__esModule: true,
	...jest.requireActual('../../../../services/register-session/audit'),
}));
const recordFact = jest.spyOn(audit, 'recordRegisterFact');
jest.mock('@wcpos/components/button', () => ({
	ButtonText: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	Button: ({
		children,
		onPress,
		testID,
		disabled,
		loading,
	}: {
		children: React.ReactNode;
		onPress: () => void;
		testID: string;
		disabled?: boolean;
		loading?: boolean;
	}) => (
		<button data-testid={testID} disabled={disabled || loading} onClick={onPress}>
			{children}
		</button>
	),
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({
		children,
		testID,
		className,
	}: {
		children: React.ReactNode;
		testID?: string;
		className?: string;
	}) => (
		<span data-testid={testID} className={className}>
			{children}
		</span>
	),
}));
jest.mock('@wcpos/components/icon', () => ({
	Icon: ({ testID, name, className }: { testID?: string; name: string; className?: string }) => (
		<span data-testid={testID} data-icon={name} className={className} />
	),
}));
jest.mock('@wcpos/components/dialog', () => ({
	Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
		open ? <>{children}</> : null,
	DialogContent: ({ children, testID }: { children: React.ReactNode; testID?: string }) => (
		<div data-testid={testID}>{children}</div>
	),
	DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
	DialogHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
	DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
	DialogFooter: jest.requireActual('../../../../../jest/footer.test-utils').DialogFooter,
}));
// The mark only draws its state: a press on it lands on its row, as on a device.
jest.mock('@wcpos/components/checkbox', () => ({
	Checkbox: ({ checked }: { checked?: boolean }) => <span aria-checked={!!checked} />,
}));
let mockSessionStatus = 'counting';
let mockMovements: { id: string; amount: string | null; sync_status: string }[] = [];
let count_note: string | null = null;
let count_denominations: { value: string; pieces: number }[] | null = null;
let approved_counted: Record<string, string> | null = null;
let unsyncedCount = 3;
let mockRefusedClose = false;
let mockCounted: Record<string, string> | null = null;
let mockLastClosure: Record<string, unknown> | null = null;
let figuresPending = false;
let blind = false,
	approval_required = false,
	varianceThreshold = '';
let separator = '.';
let expectedCash = '480.80',
	decimals: number | undefined;
const closure = { id: 's', number: 1 };
const closeSession = jest.fn(async () => closure),
	backToSelling = jest.fn(async () => undefined);
jest.mock('../../../../services/register-session/use-register-session', () => ({
	useRegisterSession: () => ({
		blind,
		varianceThreshold,
		session: {
			id: 's',
			register_id: 'r',
			status: mockSessionStatus,
			approval_required,
			approved_counted,
			count_note,
			count_denominations,
			counted: mockCounted,
		},
		binding: { registerName: 'Front' },
		expected: { cash: expectedCash, card: '20' },
		unsyncedCount,
		refusedClose: mockRefusedClose,
		lastClosure: mockLastClosure,
		movements: mockMovements,
		figuresPending,
		actions: { closeSession, backToSelling },
	}),
}));
jest.mock('../../../../contexts/app-state', () => ({
	useStoreSession: () => ({
		store: { currency: 'GBP', price_num_decimals: decimals, price_decimal_sep: separator },
		wpCredentials: { id: 7, display_name: 'Pat', username: 'pat' },
	}),
}));
jest.mock('@wcpos/query', () => ({
	useDocField: (doc: unknown, select: (doc: unknown) => unknown) => select(doc),
}));
jest.mock('../../components/register-count/register-amount', () => ({
	RegisterAmount: ({
		value,
		onChangeText,
		testID,
		onFocus,
		onBlur,
		onPressIn,
	}: {
		value: string;
		onChangeText: (v: string) => void;
		testID: string;
		onFocus?: () => void;
		onBlur?: () => void;
		onPressIn?: () => void;
	}) => (
		<input
			data-testid={testID}
			value={value}
			onChange={(e) => onChangeText(e.target.value)}
			onFocus={onFocus}
			onBlur={onBlur}
			onMouseDown={onPressIn}
		/>
	),
}));
jest.mock('./approve-sheet', () => ({
	ApproveSheet: ({ side, portalHost }: { side?: 'left' | 'right'; portalHost?: string | null }) => (
		<div data-testid="approve-sheet" data-side={side} data-portal={String(portalHost)} />
	),
}));
const enter = (value: string) =>
	fireEvent.change(screen.getByTestId('count-amount'), { target: { value } });
beforeEach(() => {
	mockSessionStatus = 'counting';
	mockMovements = [];
	approved_counted = null;
	count_note = null;
	count_denominations = null;
	unsyncedCount = 3;
	mockRefusedClose = false;
	mockCounted = null;
	mockLastClosure = null;
	figuresPending = false;
	blind = false;
	approval_required = false;
	varianceThreshold = '';
	expectedCash = '480.80';
	decimals = undefined;
	separator = '.';
	jest.clearAllMocks();
});
afterEach(() => jest.useRealTimers());
it('shows short and exact with check', () => {
	render(
		<RegisterCount
			description="Shop · open since 08:00 · Pat"
			onBack={jest.fn()}
			onClosed={jest.fn()}
		/>
	);
	enter('463.30');
	expect(screen.getByTestId('count-variance').textContent).toBe('−£17.50');
	expect(screen.getByTestId('count-result').textContent).toContain('Expected£480.80');
	expect(screen.getByTestId('count-band').textContent).toContain('short');
	enter('480.80');
	expect(screen.getByTestId('count-variance').textContent).toBe('£0.00');
	expect(screen.getByTestId('count-band').textContent).toContain('Exact');
	expect(screen.getByTestId('count-exact')).toBeTruthy();
});
it('counts in the store’s decimals: a fil over on a 3-place store is not exact', () => {
	decimals = 3;
	expectedCash = '1.250';
	render(<RegisterCount description="Shop" onBack={jest.fn()} onClosed={jest.fn()} />);
	enter('1.254');
	expect(screen.getByTestId('count-band').textContent).toContain('over');
	expect(screen.queryByTestId('count-exact')).toBeNull();
	enter('1.250');
	expect(screen.getByTestId('count-exact')).toBeTruthy();
});
it('counts in cents on a store that shows no decimals: 12.50 against 12.00 is 0.50 over', () => {
	decimals = 0;
	expectedCash = '12.00';
	render(<RegisterCount description="Shop" onBack={jest.fn()} onClosed={jest.fn()} />);
	enter('12.50');
	expect(screen.getByTestId('count-variance').textContent).toBe('+£0.50');
	expect(screen.queryByTestId('count-exact')).toBeNull();
});
it('counts two notes, clears their contribution on typing, and clears the tiles', () => {
	render(
		<RegisterCount
			description="Shop · open since 08:00 · Pat"
			onBack={jest.fn()}
			onClosed={jest.fn()}
		/>
	);
	expect(screen.queryByTestId('den-tile-20')).toBeNull();
	fireEvent.click(screen.getByTestId('count-denominations'));
	fireEvent.click(screen.getByTestId('den-tile-20'));
	fireEvent.click(screen.getByTestId('den-tile-20'));
	expect(screen.getByTestId('den-tile-20-badge').textContent).toBe('2');
	expect((screen.getByTestId('count-amount') as HTMLInputElement).value).toBe('40.00');
	enter('7');
	expect(screen.getByTestId('den-tile-20-badge').textContent).toBe('0');
	fireEvent.click(screen.getByTestId('den-tile-20'));
	expect((screen.getByTestId('count-amount') as HTMLInputElement).value).toBe('20.00');
	fireEvent.click(screen.getByTestId('count-clear'));
	expect((screen.getByTestId('count-amount') as HTMLInputElement).value).toBe('0.00');
});
it('the keypad types into the count and collapses on blur, reopens on focus', () => {
	render(<RegisterCount description="Shop" onBack={jest.fn()} onClosed={jest.fn()} />);
	const amount = screen.getByTestId('count-amount');
	fireEvent.click(screen.getByTestId('count-key-4'));
	fireEvent.click(screen.getByTestId('count-key-0'));
	expect((amount as HTMLInputElement).value).toBe('40');
	expect(screen.getByTestId('count-keypad')).toBeTruthy();
	fireEvent.blur(amount);
	expect(screen.queryByTestId('count-keypad')).toBeNull();
	expect(screen.getByTestId('count-tap-to-change').textContent).toBe('Tap the amount to edit it');
	fireEvent.focus(amount);
	expect(screen.getByTestId('count-keypad')).toBeTruthy();
	expect(screen.queryByTestId('count-tap-to-change')).toBeNull();
	fireEvent.blur(amount);
	fireEvent.mouseDown(amount);
	expect(screen.getByTestId('count-keypad')).toBeTruthy();
});
it('a blur that moves focus into the keypad keeps it open, so the digit lands', () => {
	render(<RegisterCount description="Shop" onBack={jest.fn()} onClosed={jest.fn()} />);
	const amount = screen.getByTestId('count-amount');
	enter('40');
	fireEvent.blur(amount, { relatedTarget: screen.getByTestId('count-key-5') });
	expect(screen.getByTestId('count-keypad')).toBeTruthy();
	fireEvent.click(screen.getByTestId('count-key-5'));
	expect((amount as HTMLInputElement).value).toBe('405');
	fireEvent.blur(amount, { relatedTarget: screen.getByTestId('count-note') });
	expect(screen.queryByTestId('count-keypad')).toBeNull();
});
it('a count entered by keys alone collapses the keypad when focus leaves for the note', () => {
	render(<RegisterCount description="Shop" onBack={jest.fn()} onClosed={jest.fn()} />);
	for (const key of ['4', '0']) fireEvent.click(screen.getByTestId(`count-key-${key}`));
	expect((screen.getByTestId('count-amount') as HTMLInputElement).value).toBe('40');
	// Focus moves from a key to another key: still inside the region.
	fireEvent.blur(screen.getByTestId('count-key-0'), {
		relatedTarget: screen.getByTestId('count-key-5'),
	});
	expect(screen.getByTestId('count-keypad')).toBeTruthy();
	// Focus leaves the region for the note: collapsed.
	fireEvent.blur(screen.getByTestId('count-key-5'), {
		relatedTarget: screen.getByTestId('count-note'),
	});
	expect(screen.queryByTestId('count-keypad')).toBeNull();
	expect(screen.getByTestId('count-tap-to-change')).toBeTruthy();
});
it('the keypad starts a fresh count after denominations; the earlier typed amount never returns', () => {
	render(<RegisterCount description="Shop" onBack={jest.fn()} onClosed={jest.fn()} />);
	enter('100');
	fireEvent.click(screen.getByTestId('count-denominations'));
	fireEvent.click(screen.getByTestId('den-tile-20'));
	expect((screen.getByTestId('count-amount') as HTMLInputElement).value).toBe('20.00');
	fireEvent.focus(screen.getByTestId('count-amount'));
	fireEvent.click(screen.getByTestId('count-key-7'));
	expect((screen.getByTestId('count-amount') as HTMLInputElement).value).toBe('7');
	expect(screen.getByTestId('den-tile-20-badge').textContent).toBe('0');
});
it('after Clear the keypad starts a new count instead of being stuck on 0.00', () => {
	render(<RegisterCount description="Shop" onBack={jest.fn()} onClosed={jest.fn()} />);
	fireEvent.click(screen.getByTestId('count-denominations'));
	fireEvent.click(screen.getByTestId('den-tile-20'));
	fireEvent.click(screen.getByTestId('count-clear'));
	expect((screen.getByTestId('count-amount') as HTMLInputElement).value).toBe('0.00');
	fireEvent.focus(screen.getByTestId('count-amount'));
	for (const key of ['4', '2']) fireEvent.click(screen.getByTestId(`count-key-${key}`));
	expect((screen.getByTestId('count-amount') as HTMLInputElement).value).toBe('42');
	// A zero still being typed (0.0) is not a cleared count: the next digit joins it.
	enter('0.0');
	fireEvent.click(screen.getByTestId('count-key-5'));
	expect((screen.getByTestId('count-amount') as HTMLInputElement).value).toBe('0.05');
});
it.each(['', 'invalid'])('does not collapse an invalid count %s on blur', (value) => {
	render(<RegisterCount description="Shop" onBack={jest.fn()} onClosed={jest.fn()} />);
	enter(value);
	fireEvent.blur(screen.getByTestId('count-amount'));
	expect(screen.getByTestId('count-keypad')).toBeTruthy();
	expect(screen.queryByTestId('count-result')).toBeNull();
});
it('a denomination tap collapses the keypad; keypad entry clears pieces and Clear resets both', () => {
	render(<RegisterCount description="Shop" onBack={jest.fn()} onClosed={jest.fn()} />);
	fireEvent.click(screen.getByTestId('count-denominations'));
	fireEvent.click(screen.getByTestId('den-tile-20'));
	expect(screen.queryByTestId('count-keypad')).toBeNull();
	expect(screen.getByTestId('count-tap-to-change')).toBeTruthy();
	fireEvent.focus(screen.getByTestId('count-amount'));
	fireEvent.click(screen.getByTestId('count-key-7'));
	expect((screen.getByTestId('count-amount') as HTMLInputElement).value).toBe('7');
	expect(screen.getByTestId('den-tile-20-badge').textContent).toBe('0');
	fireEvent.click(screen.getByTestId('den-tile-20'));
	fireEvent.click(screen.getByTestId('count-clear'));
	expect((screen.getByTestId('count-amount') as HTMLInputElement).value).toBe('0.00');
	expect(screen.getByTestId('den-tile-20-badge').textContent).toBe('0');
});
it('uses the store separator for both keypad and field entry but closes with a point', async () => {
	separator = ',';
	render(<RegisterCount description="Shop" onBack={jest.fn()} onClosed={jest.fn()} />);
	for (const key of ['4', 'decimal', '5']) fireEvent.click(screen.getByTestId(`count-key-${key}`));
	expect((screen.getByTestId('count-amount') as HTMLInputElement).value).toBe('4,5');
	expect(screen.getByTestId('count-key-decimal').textContent).toBe(',');
	expect(screen.getByTestId('count-keypad')).toBeTruthy();
	enter('12,50');
	await act(async () => fireEvent.click(screen.getByTestId('count-close')));
	expect(closeSession).toHaveBeenCalledWith({
		counted: { cash: '12.50' },
		note: '',
		denominations: [],
	});
});
it.each([
	['478.80', 'short', '−£2.00', 'bg-bad-bg', 'arrowDown', 'text-bad'],
	['483.80', 'over', '+£3.00', 'bg-ok-bg', 'arrowUp', 'text-ok'],
	['480.80', 'Exact', '£0.00', 'bg-muted', 'check', 'text-muted-foreground'],
])(
	'the band for %s is tinted by sign with foreground words and signed amount',
	(cash, word, signed, tint, icon, ink) => {
		render(<RegisterCount description="Shop" onBack={jest.fn()} onClosed={jest.fn()} />);
		enter(cash);
		const band = screen.getByTestId('count-band');
		expect(band.dataset.classes).toContain(tint);
		expect(band.textContent).toContain(word);
		expect(screen.getByTestId('count-variance').textContent).toBe(signed);
		expect(band.querySelector(`[data-icon="${icon}"]`)?.className).toContain(ink);
		for (const text of band.querySelectorAll('span:not([data-icon])')) {
			expect(text.className).not.toMatch(/text-(bad|ok)/);
		}
		expect(!!screen.queryByTestId('count-exact')).toBe(word === 'Exact');
	}
);
it('holds for ten, repeats, and does not also single tap', () => {
	jest.useFakeTimers();
	render(
		<RegisterCount
			description="Shop · open since 08:00 · Pat"
			onBack={jest.fn()}
			onClosed={jest.fn()}
		/>
	);
	fireEvent.click(screen.getByTestId('count-denominations'));
	const tile = screen.getByTestId('den-tile-20');
	fireEvent.mouseDown(tile);
	act(() => jest.advanceTimersByTime(400));
	expect(screen.getByTestId('den-tile-20-badge').textContent).toBe('10');
	act(() => jest.advanceTimersByTime(150));
	expect(screen.getByTestId('den-tile-20-badge').textContent).toBe('20');
	fireEvent.mouseUp(tile);
	fireEvent.click(tile);
	act(() => jest.advanceTimersByTime(500));
	expect(screen.getByTestId('den-tile-20-badge').textContent).toBe('20');
});
it('blind cashier sees neither expected nor local manager line', () => {
	blind = true;
	varianceThreshold = '5';
	render(
		<RegisterCount
			description="Shop · open since 08:00 · Pat"
			onBack={jest.fn()}
			onClosed={jest.fn()}
		/>
	);
	enter('463.30');
	expect(screen.queryByTestId('count-variance')).toBeNull();
	expect(screen.queryByTestId('count-manager-line')).toBeNull();
	expect(screen.getByTestId('count-close').textContent).toBe('Close & print');
});
it('requires manager over threshold', () => {
	varianceThreshold = '5';
	render(
		<RegisterCount
			description="Shop · open since 08:00 · Pat"
			onBack={jest.fn()}
			onClosed={jest.fn()}
		/>
	);
	enter('463.30');
	expect(screen.getByTestId('count-manager-line-title').textContent).toContain('£5.00');
	expect(screen.getByTestId('count-close').textContent).toBe('Approve & close');
	fireEvent.click(screen.getByTestId('count-close'));
	expect(screen.getByTestId('approve-sheet')).toBeTruthy();
	expect(closeSession).not.toHaveBeenCalled();
	expect(recordFact).toHaveBeenCalledWith({
		actor: { id: '7', name: 'Pat' },
		...{
			kind: 'variance-over-threshold',
			sessionId: 's',
			registerId: 'r',
			variance: '-17.50',
			threshold: '5',
		},
	});
});
it('forwards its side and host to the approval sheet', () => {
	varianceThreshold = '5';
	render(
		<RegisterCount
			description="Shop · open since 08:00 · Pat"
			onBack={jest.fn()}
			onClosed={jest.fn()}
			side="right"
			portalHost="scene"
		/>
	);
	enter('463.30');
	fireEvent.click(screen.getByTestId('count-close'));
	expect(screen.getByTestId('approve-sheet').getAttribute('data-side')).toBe('right');
	expect(screen.getByTestId('approve-sheet').getAttribute('data-portal')).toBe('scene');
});
it('server refusal requires approval even for an exact blind count', () => {
	blind = true;
	approval_required = true;
	render(
		<RegisterCount
			description="Shop · open since 08:00 · Pat"
			onBack={jest.fn()}
			onClosed={jest.fn()}
		/>
	);
	enter('480.80');
	expect(screen.getByTestId('count-manager-line-title').textContent).toBe('Approval needed');
	expect(screen.queryByTestId('count-variance')).toBeNull();
});
it('closes with other tenders and reports the snapshot; blank cash is disabled', async () => {
	const onClosed = jest.fn();
	render(
		<RegisterCount
			description="Shop · open since 08:00 · Pat"
			onBack={jest.fn()}
			onClosed={onClosed}
		/>
	);
	expect((screen.getByTestId('count-close') as HTMLButtonElement).disabled).toBe(true);
	expect(screen.getByTestId('count-unsynced').textContent).toContain('3 sales');
	enter('480.80');
	fireEvent.click(screen.getByTestId('count-other-tenders'));
	fireEvent.change(screen.getByTestId('count-tender-card'), { target: { value: '22' } });
	fireEvent.click(screen.getByTestId('count-close'));
	await waitFor(() =>
		expect(onClosed).toHaveBeenCalledWith({
			closure,
			counted: '480.80',
			expected: '480.80',
			blind: false,
		})
	);
	expect(closeSession).toHaveBeenCalledWith({
		counted: { cash: '480.80', card: '22' },
		note: '',
		denominations: [],
	});
});

it('a seeded counting session says the figures are still to come and cannot close', () => {
	figuresPending = true;
	render(
		<RegisterCount
			description="Shop · open since 08:00 · Pat"
			onBack={jest.fn()}
			onClosed={jest.fn()}
		/>
	);
	expect(screen.getByTestId('count-figures-pending').textContent).toContain(
		'Figures arrive with the next sync.'
	);
	enter('480.80');
	expect((screen.getByTestId('count-close') as HTMLButtonElement).disabled).toBe(true);
	fireEvent.click(screen.getByTestId('count-close'));
	expect(closeSession).not.toHaveBeenCalled();
});

it('returns to selling without closing', async () => {
	render(
		<RegisterCount
			description="Shop · open since 08:00 · Pat"
			onBack={jest.fn()}
			onClosed={jest.fn()}
		/>
	);
	fireEvent.click(screen.getByTestId('count-back'));
	await waitFor(() => expect(backToSelling).toHaveBeenCalledTimes(1));
	expect(closeSession).not.toHaveBeenCalled();
});

it.each([
	[1, '1 sale not yet'],
	[3, '3 sales not yet'],
] as const)('pluralizes %s unsynced sales', (count, text) => {
	unsyncedCount = count;
	render(
		<RegisterCount
			description="Shop · open since 08:00 · Pat"
			onBack={jest.fn()}
			onClosed={jest.fn()}
		/>
	);
	expect(screen.getByTestId('count-unsynced').textContent).toContain(text);
});

it('retries a failed close without a second approval for the same count', async () => {
	// A failed close or a restart keeps the approval; the same over-threshold count is not
	// re-approved (expected cash is 480.80, so 463.30 is a 17.50 short against a 5 threshold).
	varianceThreshold = '5';
	approved_counted = { cash: '463.30' };
	closeSession.mockRejectedValueOnce(new Error('offline'));
	render(
		<RegisterCount
			description="Shop · open since 08:00 · Pat"
			onBack={jest.fn()}
			onClosed={jest.fn()}
		/>
	);
	enter('463.30');
	await act(async () => fireEvent.click(screen.getByTestId('count-close')));
	await act(async () => fireEvent.click(screen.getByTestId('count-close')));
	expect(screen.queryByTestId('approve-sheet')).toBeNull();
	expect(closeSession).toHaveBeenCalledTimes(2);
});

it('requires approval for the same count after returning to selling and counting again', async () => {
	varianceThreshold = '5';
	approved_counted = { cash: '463.30' };
	approval_required = true;
	const sessions = {
		findOne: () => ({
			exec: async () => ({
				incrementalPatch: async (patch: Record<string, unknown>) => {
					if ('approved_counted' in patch)
						approved_counted = patch.approved_counted as typeof approved_counted;
					if ('approval_required' in patch) approval_required = patch.approval_required as boolean;
				},
			}),
		}),
	};
	const storeDB = { collections: { register_sessions: sessions } };
	backToSelling.mockImplementationOnce(async () => {
		await resumeSelling(storeDB, 's');
	});
	const view = render(
		<RegisterCount
			description="Shop · open since 08:00 · Pat"
			onBack={jest.fn()}
			onClosed={jest.fn()}
		/>
	);
	await act(async () => fireEvent.click(screen.getByTestId('count-back')));
	await startCounting(storeDB, 's');
	view.unmount();
	render(
		<RegisterCount
			description="Shop · open since 08:00 · Pat"
			onBack={jest.fn()}
			onClosed={jest.fn()}
		/>
	);
	enter('463.30');
	fireEvent.click(screen.getByTestId('count-close'));
	expect(closeSession).not.toHaveBeenCalled();
	expect(screen.getByTestId('approve-sheet')).toBeTruthy();
	expect(approval_required).toBe(true);
});

it('requests approval again when the count changes after approval', () => {
	approved_counted = { cash: '463.30' };
	render(
		<RegisterCount
			description="Shop · open since 08:00 · Pat"
			onBack={jest.fn()}
			onClosed={jest.fn()}
		/>
	);
	enter('480.80');
	fireEvent.click(screen.getByTestId('count-close'));
	expect(closeSession).not.toHaveBeenCalled();
	expect(screen.getByTestId('approve-sheet')).toBeTruthy();
});

let mockCarts = { count: 0 };
jest.mock('../contexts/current-order/use-open-orders-handle', () => ({
	useOpenOrdersHandle: () => ({ subscribe: () => () => {}, value: mockCarts }),
}));
jest.mock('@wcpos/components/icon-button', () => ({
	IconButton: ({
		onPress,
		testID,
		disabled,
	}: {
		onPress: () => void;
		testID: string;
		disabled?: boolean;
	}) => <button data-testid={testID} disabled={disabled} onClick={onPress} />,
}));
it.each([0, 2])(
	'shows the open-carts warning only for %s carts, without blocking close',
	(count) => {
		const previous = mockCarts;
		mockCarts = { count };
		try {
			render(<RegisterCount description="Shop · Pat" onBack={jest.fn()} onClosed={jest.fn()} />);
			enter('480.80');
			expect(screen.getByRole('heading').textContent).toBe('Close Front');
			expect(screen.getByText('Shop · Pat')).toBeTruthy();
			expect(screen.getByTestId('count-unsynced').textContent).toContain(
				'the closure will record them'
			);
			expect(screen.queryByTestId('count-open-carts')?.textContent ?? null).toBe(
				count ? '2 carts still open · they wait for their cashier' : null
			);
			expect((screen.getByTestId('count-close') as HTMLButtonElement).disabled).toBe(false);
			expect(screen.getByTestId('count-close').textContent).toBe('Close & print');
		} finally {
			mockCarts = previous;
		}
	}
);
it('backs out only after returning the session to selling', async () => {
	const onBack = jest.fn();
	render(<RegisterCount description="Shop" onBack={onBack} onClosed={jest.fn()} />);
	fireEvent.click(screen.getByTestId('count-back'));
	await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
	expect(backToSelling.mock.invocationCallOrder[0]).toBeLessThan(
		onBack.mock.invocationCallOrder[0]
	);
});

it('backs out of a closed session without returning it to selling', async () => {
	mockSessionStatus = 'closed';
	const onBack = jest.fn();
	render(<RegisterCount description="Shop" onBack={onBack} onClosed={jest.fn()} />);
	fireEvent.click(screen.getByTestId('count-back'));
	await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
	expect(backToSelling).not.toHaveBeenCalled();
	expect(closeSession).not.toHaveBeenCalled();
});

it.each([false, true])(
	'passes the note and two counted faces in blind mode %s',
	async (isBlind) => {
		blind = isBlind;
		render(<RegisterCount description="Shop" onBack={jest.fn()} onClosed={jest.fn()} />);
		fireEvent.change(screen.getByTestId('count-note'), { target: { value: 'Found notes' } });
		fireEvent.click(screen.getByTestId('count-denominations'));
		fireEvent.click(screen.getByTestId('den-tile-20'));
		fireEvent.click(screen.getByTestId('den-tile-5'));
		fireEvent.click(screen.getByTestId('den-tile-5'));
		await act(async () => fireEvent.click(screen.getByTestId('count-close')));
		expect(closeSession).toHaveBeenCalledWith({
			counted: { cash: '30.00' },
			note: 'Found notes',
			denominations: [
				{ value: '20', pieces: 1 },
				{ value: '5', pieces: 2 },
			],
		});
	}
);

it('restores the note and denomination tiles when the count pane reopens', () => {
	count_note = 'Stored note';
	count_denominations = [
		{ value: '20', pieces: 2 },
		{ value: '5', pieces: 1 },
	];
	render(<RegisterCount description="Shop" onBack={jest.fn()} onClosed={jest.fn()} />);
	expect((screen.getByTestId('count-note') as HTMLInputElement).value).toBe('Stored note');
	fireEvent.click(screen.getByTestId('count-denominations'));
	expect(screen.getByTestId('den-tile-20-badge').textContent).toBe('2');
	expect(screen.getByTestId('den-tile-5-badge').textContent).toBe('1');
});

describe('#2016: a refused close', () => {
	const refused = (status: string) => {
		mockSessionStatus = status;
		mockRefusedClose = true;
		mockCounted = { cash: '40.00' };
		mockLastClosure = {
			id: 's',
			counted: { cash: '40.00' },
			breakdowns: {
				variance_note: 'Short a note',
				denominations: [{ value: '20', pieces: 2, amount: '40' }],
			},
		};
	};
	it.each(['closed', 'counting'])(
		'at %s shows the band with the count kept and no Retry; the footer is the retry',
		async (status) => {
			refused(status);
			render(<RegisterCount description="Shop" onBack={jest.fn()} onClosed={jest.fn()} />);
			const band = screen.getByTestId('register-panel-refused-close').textContent;
			expect(band).toContain('The store refused this close. Your count is kept.');
			expect(band).not.toContain('Sales are blocked while this register is being counted');
			expect(screen.queryByTestId('register-panel-retry-close')).toBeNull();
			expect((screen.getByTestId('count-amount') as HTMLInputElement).value).toBe('40.00');
			expect(screen.getByTestId('count-close').textContent).toBe('Retry');
			await act(async () => fireEvent.click(screen.getByTestId('count-close')));
			expect(closeSession).toHaveBeenCalledWith(
				expect.objectContaining({ counted: { cash: '40.00' }, note: 'Short a note' })
			);
		}
	);
	it('asks for the manager before a retry over the threshold', async () => {
		refused('counting');
		varianceThreshold = '5';
		render(<RegisterCount description="Shop" onBack={jest.fn()} onClosed={jest.fn()} />);
		expect(screen.getByTestId('count-close').textContent).toBe('Approve & close');
		await act(async () => fireEvent.click(screen.getByTestId('count-close')));
		expect(screen.getByTestId('approve-sheet')).toBeTruthy();
		expect(closeSession).not.toHaveBeenCalled();
	});
	it('back from a refused close already at open does not abandon it again', async () => {
		refused('open');
		const onBack = jest.fn();
		render(<RegisterCount description="Shop" onBack={onBack} onClosed={jest.fn()} />);
		fireEvent.click(screen.getByTestId('count-back'));
		await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
		expect(backToSelling).not.toHaveBeenCalled();
	});
	it('shows no band at a count the store has not refused', () => {
		render(<RegisterCount description="Shop" onBack={jest.fn()} onClosed={jest.fn()} />);
		expect(screen.queryByTestId('register-panel-refused-close')).toBeNull();
	});
	it('back to selling abandons a refused close that reads closed', async () => {
		refused('closed');
		const onBack = jest.fn();
		render(<RegisterCount description="Shop" onBack={onBack} onClosed={jest.fn()} />);
		fireEvent.click(screen.getByTestId('count-back'));
		await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
		expect(backToSelling).toHaveBeenCalledTimes(1);
		expect(closeSession).not.toHaveBeenCalled();
	});
	const pane = () => <RegisterCount description="Shop" onBack={jest.fn()} onClosed={jest.fn()} />;
	const shown = () => {
		fireEvent.click(screen.getByTestId('count-denominations'));
		return {
			amount: (screen.getByTestId('count-amount') as HTMLInputElement).value,
			note: (screen.getByTestId('count-note') as HTMLInputElement).value,
			twenties: screen.queryByTestId('den-tile-20-badge')?.textContent ?? null,
		};
	};
	const kept = { amount: '40.00', note: 'Short a note', twenties: '2' };
	it('starts the pane from the kept count, note and pieces', () => {
		refused('counting');
		render(pane());
		expect(shown()).toEqual(kept);
	});
	it('fills a pane that was open before the refusal landed', () => {
		const { rerender } = render(pane());
		refused('counting');
		rerender(pane());
		expect(shown()).toEqual(kept);
	});
	it('leaves the pane alone when the close was not refused', () => {
		refused('counting');
		mockRefusedClose = false;
		mockCounted = { cash: '12.00' };
		const { rerender } = render(pane());
		rerender(pane());
		expect(shown()).toEqual({ amount: '12.00', note: '', twenties: '0' });
	});
	it('Retry sends the count as edited from the kept one', async () => {
		refused('counting');
		render(pane());
		enter('41.50');
		fireEvent.change(screen.getByTestId('count-note'), { target: { value: 'Recounted' } });
		await act(async () => fireEvent.click(screen.getByTestId('count-close')));
		expect(closeSession).toHaveBeenCalledWith(
			expect.objectContaining({ counted: { cash: '41.50' }, note: 'Recounted' })
		);
	});
});

describe('cash the store refused (#3271)', () => {
	const refused = (id: string, amount: string | null = '20.0000') => ({
		id,
		amount,
		sync_status: 'failed',
	});
	const close = () => screen.getByTestId('count-close') as HTMLButtonElement;
	const view = () => <RegisterCount description="Shop" onBack={jest.fn()} onClosed={jest.fn()} />;

	it('names the refused cash and closes only after one acknowledgement', async () => {
		mockMovements = [refused('m1'), { id: 'm2', amount: '5.0000', sync_status: 'synced' }];
		render(view());
		enter('480.80');
		expect(screen.getByTestId('count-refused-cash-title').textContent).toBe(
			'£20.00 in cash was refused by the store'
		);
		expect(close().disabled).toBe(true);
		fireEvent.click(screen.getByTestId('count-refused-cash-ack'));
		expect(screen.getByTestId('count-refused-cash-ack').getAttribute('aria-checked')).toBe('true');
		expect(close().disabled).toBe(false);
		await act(async () => fireEvent.click(close()));
		expect(closeSession).toHaveBeenCalledTimes(1);
	});

	it('pressing the label ticks it too, and pressing again unticks it', () => {
		mockMovements = [refused('m1')];
		render(view());
		enter('480.80');
		fireEvent.click(screen.getByText('I understand, close anyway'));
		expect(close().disabled).toBe(false);
		fireEvent.click(screen.getByText('I understand, close anyway'));
		expect(close().disabled).toBe(true);
	});

	it('on the manager path the press opens the approval only after the tick', () => {
		mockMovements = [refused('m1')];
		varianceThreshold = '5';
		render(view());
		enter('463.30');
		expect(close().textContent).toBe('Approve & close');
		fireEvent.click(close());
		expect(screen.queryByTestId('approve-sheet')).toBeNull();
		fireEvent.click(screen.getByTestId('count-refused-cash-ack'));
		fireEvent.click(close());
		expect(screen.getByTestId('approve-sheet')).toBeTruthy();
		expect(closeSession).not.toHaveBeenCalled();
	});

	it('a further refusal closes an open approval sheet until the new tick', () => {
		mockMovements = [refused('m1')];
		varianceThreshold = '5';
		const { rerender } = render(view());
		enter('463.30');
		fireEvent.click(screen.getByTestId('count-refused-cash-ack'));
		fireEvent.click(close());
		expect(screen.getByTestId('approve-sheet')).toBeTruthy();
		mockMovements = [refused('m1'), refused('m2', '7.5000')];
		rerender(view());
		expect(screen.queryByTestId('approve-sheet')).toBeNull();
		expect(close().disabled).toBe(true);
		expect(closeSession).not.toHaveBeenCalled();
		fireEvent.click(screen.getByTestId('count-refused-cash-ack'));
		expect(screen.queryByTestId('approve-sheet')).toBeNull();
		fireEvent.click(close());
		expect(screen.getByTestId('approve-sheet')).toBeTruthy();
	});

	it.each([
		['a refused no-sale moves no cash', [refused('m1', '0')]],
		['nothing refused', [{ id: 'm1', amount: '20.0000', sync_status: 'pending' }]],
	])('%s: no notice, Close enabled', (_, movements) => {
		mockMovements = movements;
		render(view());
		enter('480.80');
		expect(screen.queryByTestId('count-refused-cash')).toBeNull();
		expect(close().disabled).toBe(false);
	});

	it('a further refusal after the tick asks again', () => {
		mockMovements = [refused('m1')];
		const { rerender } = render(view());
		enter('480.80');
		fireEvent.click(screen.getByTestId('count-refused-cash-ack'));
		expect(close().disabled).toBe(false);
		mockMovements = [refused('m1'), refused('m2', '7.5000')];
		rerender(view());
		expect(screen.getByTestId('count-refused-cash-title').textContent).toBe(
			'£27.50 in cash was refused by the store'
		);
		expect(close().disabled).toBe(true);
	});
});
