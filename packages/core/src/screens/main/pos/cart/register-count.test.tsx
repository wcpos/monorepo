/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { backToSelling as resumeSelling, startCounting } from '@wcpos/query/register-session';

import * as audit from '../../../../services/register-session/audit';
import { createTestT } from '../../../../../jest/translate';
import { RegisterCount } from './register-count';
jest.mock('@wcpos/utils/open-external-url', () => ({ openExternalURL: jest.fn() }));
jest.mock('@wcpos/components/toast', () => ({ Toast: { show: jest.fn() } }));
jest.mock('../../../../contexts/translations', () => ({ useT: () => createTestT() }));
jest.mock('../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ currencySymbol: '£', format: (n: number) => `£${n.toFixed(2)}` }),
}));
jest.mock('../../../../services/register-session/audit', () => ({
	__esModule: true,
	...jest.requireActual('../../../../services/register-session/audit'),
}));
const recordFact = jest.spyOn(audit, 'recordRegisterFact');
jest.mock('../contexts/overlay-side', () => ({ usePanelSide: () => 'right' }));
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
jest.mock('@wcpos/components/input', () => ({
	Input: ({
		value,
		onChangeText,
		testID,
		secureTextEntry,
	}: {
		value: string;
		onChangeText: (v: string) => void;
		testID: string;
		secureTextEntry?: boolean;
	}) => (
		<input
			type={secureTextEntry ? 'password' : 'text'}
			data-testid={testID}
			value={value}
			onChange={(e) => onChangeText(e.target.value)}
		/>
	),
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, testID }: { children: React.ReactNode; testID?: string }) => (
		<span data-testid={testID}>{children}</span>
	),
}));
jest.mock('@wcpos/components/icon', () => ({
	Icon: ({ testID }: { testID?: string }) => <span data-testid={testID} />,
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
let approved_counted: Record<string, string> | null = null;
let unsyncedCount = 3;
let figuresPending = false;
let blind = false,
	approval_required = false,
	varianceThreshold = '';
const closure = { id: 's', number: 1 };
const closeSession = jest.fn(async () => closure),
	backToSelling = jest.fn(async () => undefined);
jest.mock('../../../../services/register-session/use-register-session', () => ({
	useRegisterSession: () => ({
		blind,
		varianceThreshold,
		session: { id: 's', register_id: 'r', approval_required, approved_counted },
		binding: { registerName: 'Front' },
		expected: { cash: '480.80', card: '20' },
		unsyncedCount,
		figuresPending,
		actions: { closeSession, backToSelling },
	}),
}));
jest.mock('../../../../contexts/app-state', () => ({
	useStoreSession: () => ({
		store: { currency: 'GBP' },
		wpCredentials: { id: 7, display_name: 'Pat', username: 'pat' },
	}),
}));
jest.mock('@wcpos/query', () => ({
	useDocField: (doc: unknown, select: (doc: unknown) => unknown) => select(doc),
}));
jest.mock('./movement-sheet', () => ({
	RegisterAmount: ({
		value,
		onChangeText,
		testID,
	}: {
		value: string;
		onChangeText: (v: string) => void;
		testID: string;
	}) => <input data-testid={testID} value={value} onChange={(e) => onChangeText(e.target.value)} />,
}));
jest.mock('./approve-sheet', () => ({ ApproveSheet: () => <div data-testid="approve-sheet" /> }));
const enter = (value: string) =>
	fireEvent.change(screen.getByTestId('count-amount'), { target: { value } });
beforeEach(() => {
	approved_counted = null;
	unsyncedCount = 3;
	figuresPending = false;
	blind = false;
	approval_required = false;
	varianceThreshold = '';
	jest.clearAllMocks();
});
afterEach(() => jest.useRealTimers());
it('shows short and exact with check', () => {
	render(
		<RegisterCount
			description="Shop · open since 08:00 · Pat"
			onBack={jest.fn()}
			onClose={jest.fn()}
			onClosed={jest.fn()}
		/>
	);
	enter('463.30');
	expect(screen.getByTestId('count-variance').textContent).toBe('−£17.50 short');
	expect(screen.getByTestId('count-variance').parentElement?.parentElement?.textContent).toContain(
		'Expected £480.80'
	);
	enter('480.80');
	expect(screen.getByTestId('count-variance').textContent).toContain('Exact');
	expect(screen.getByTestId('count-exact')).toBeTruthy();
});
it('counts two notes, clears their contribution on typing, and clears the tiles', () => {
	render(
		<RegisterCount
			description="Shop · open since 08:00 · Pat"
			onBack={jest.fn()}
			onClose={jest.fn()}
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
it('holds for ten, repeats, and does not also single tap', () => {
	jest.useFakeTimers();
	render(
		<RegisterCount
			description="Shop · open since 08:00 · Pat"
			onBack={jest.fn()}
			onClose={jest.fn()}
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
			onClose={jest.fn()}
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
			onClose={jest.fn()}
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
it('server refusal requires approval even for an exact blind count', () => {
	blind = true;
	approval_required = true;
	render(
		<RegisterCount
			description="Shop · open since 08:00 · Pat"
			onBack={jest.fn()}
			onClose={jest.fn()}
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
			onClose={jest.fn()}
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
	expect(closeSession).toHaveBeenCalledWith({ counted: { cash: '480.80', card: '22' } });
});

it('a seeded counting session says the figures are still to come and cannot close', () => {
	figuresPending = true;
	render(
		<RegisterCount
			description="Shop · open since 08:00 · Pat"
			onBack={jest.fn()}
			onClose={jest.fn()}
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
			onClose={jest.fn()}
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
			onClose={jest.fn()}
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
			onClose={jest.fn()}
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
			onClose={jest.fn()}
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
			onClose={jest.fn()}
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
			onClose={jest.fn()}
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
			render(
				<RegisterCount
					description="Shop · Pat"
					onBack={jest.fn()}
					onClose={jest.fn()}
					onClosed={jest.fn()}
				/>
			);
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
	render(
		<RegisterCount description="Shop" onBack={onBack} onClose={jest.fn()} onClosed={jest.fn()} />
	);
	fireEvent.click(screen.getByTestId('count-back'));
	await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
	expect(backToSelling.mock.invocationCallOrder[0]).toBeLessThan(
		onBack.mock.invocationCallOrder[0]
	);
});
