/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { createTestT } from '../../../../../jest/translate';
import { RegisterCount } from './register-count';
jest.mock('../../../../contexts/translations', () => ({ useT: () => createTestT() }));
jest.mock('../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ currencySymbol: '£', format: (n: number) => `£${n.toFixed(2)}` }),
}));
jest.mock('../contexts/overlay-side', () => ({ usePOSOverlaySide: () => 'right' }));
jest.mock('@wcpos/components/button', () => ({
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
}));
let unsyncedCount = 3;
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
		session: { id: 's', approval_required },
		binding: { registerName: 'Front' },
		expected: { cash: '480.80', card: '20' },
		unsyncedCount,
		actions: { closeSession, backToSelling },
	}),
}));
jest.mock('../../../../contexts/app-state', () => ({
	useStoreSession: () => ({ store: { currency: 'GBP' } }),
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
	unsyncedCount = 3;
	blind = false;
	approval_required = false;
	varianceThreshold = '';
	jest.clearAllMocks();
});
afterEach(() => jest.useRealTimers());
it('shows short and exact with check', () => {
	render(<RegisterCount onClosed={jest.fn()} />);
	enter('463.30');
	expect(screen.getByTestId('count-variance').textContent).toBe('Expected £480.80 · −£17.50 short');
	enter('480.80');
	expect(screen.getByTestId('count-variance').textContent).toContain('Exact');
	expect(screen.getByTestId('count-exact')).toBeTruthy();
});
it('counts two notes, clears their contribution on typing, and clears the tiles', () => {
	render(<RegisterCount onClosed={jest.fn()} />);
	expect(screen.queryByTestId('den-tile-20')).toBeNull();
	fireEvent.click(screen.getByTestId('count-denominations'));
	fireEvent.click(screen.getByTestId('den-tile-20'));
	fireEvent.click(screen.getByTestId('den-tile-20'));
	expect(screen.getByTestId('den-count-20').textContent).toBe('2');
	expect((screen.getByTestId('count-amount') as HTMLInputElement).value).toBe('40.00');
	enter('7');
	expect(screen.getByTestId('den-count-20').textContent).toBe('0');
	fireEvent.click(screen.getByTestId('den-tile-20'));
	expect((screen.getByTestId('count-amount') as HTMLInputElement).value).toBe('20.00');
	fireEvent.click(screen.getByTestId('count-clear'));
	expect((screen.getByTestId('count-amount') as HTMLInputElement).value).toBe('0.00');
});
it('holds for ten, repeats, and does not also single tap', () => {
	jest.useFakeTimers();
	render(<RegisterCount onClosed={jest.fn()} />);
	fireEvent.click(screen.getByTestId('count-denominations'));
	const tile = screen.getByTestId('den-tile-20');
	fireEvent.mouseDown(tile);
	act(() => jest.advanceTimersByTime(400));
	expect(screen.getByTestId('den-count-20').textContent).toBe('10');
	act(() => jest.advanceTimersByTime(150));
	expect(screen.getByTestId('den-count-20').textContent).toBe('20');
	fireEvent.mouseUp(tile);
	fireEvent.click(tile);
	act(() => jest.advanceTimersByTime(500));
	expect(screen.getByTestId('den-count-20').textContent).toBe('20');
});
it('blind cashier sees neither expected nor local manager line', () => {
	blind = true;
	varianceThreshold = '5';
	render(<RegisterCount onClosed={jest.fn()} />);
	enter('463.30');
	expect(screen.queryByTestId('count-variance')).toBeNull();
	expect(screen.queryByTestId('count-manager-line')).toBeNull();
	expect(screen.getByTestId('count-close').textContent).toBe('Close & print');
});
it('requires manager over threshold', () => {
	varianceThreshold = '5';
	render(<RegisterCount onClosed={jest.fn()} />);
	enter('463.30');
	expect(screen.getByTestId('count-manager-line').textContent).toContain('£5.00');
	expect(screen.getByTestId('count-close').textContent).toBe('Approve & close');
	fireEvent.click(screen.getByTestId('count-close'));
	expect(screen.getByTestId('approve-sheet')).toBeTruthy();
	expect(closeSession).not.toHaveBeenCalled();
});
it('server refusal requires approval even for an exact blind count', () => {
	blind = true;
	approval_required = true;
	render(<RegisterCount onClosed={jest.fn()} />);
	enter('480.80');
	expect(screen.getByTestId('count-manager-line').textContent).toBe('Approval needed');
	expect(screen.queryByTestId('count-variance')).toBeNull();
});
it('closes with other tenders and reports the snapshot; blank cash is disabled', async () => {
	const onClosed = jest.fn();
	render(<RegisterCount onClosed={onClosed} />);
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

it('returns to selling without closing', async () => {
	render(<RegisterCount onClosed={jest.fn()} />);
	fireEvent.click(screen.getByTestId('count-back'));
	await waitFor(() => expect(backToSelling).toHaveBeenCalledTimes(1));
	expect(closeSession).not.toHaveBeenCalled();
});

it.each([
	[1, '1 sale not yet'],
	[3, '3 sales not yet'],
] as const)('pluralizes %s unsynced sales', (count, text) => {
	unsyncedCount = count;
	render(<RegisterCount onClosed={jest.fn()} />);
	expect(screen.getByTestId('count-unsynced').textContent).toContain(text);
});
