/** @jest-environment jsdom */
import * as React from 'react';

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import { recordPaymentAttention } from '@wcpos/query/store-local';
import type { StoreDatabase } from '@wcpos/database';

import { PaymentAttentionNotice } from './attention-notice';

const mockSetParams = jest.fn();
const mockResident = jest.fn();
const mockRefresh = jest.fn();
const mockWarn = jest.fn();
let mockIsPro = true;
let mockStoreDB: StoreDatabase;
jest.mock('expo-router', () => ({ useRouter: () => ({ setParams: mockSetParams }) }));
jest.mock('@wcpos/query', () => ({ useQueryRuntime: () => ({ engine: 'engine' }) }));
jest.mock('@wcpos/query/record-readers', () => ({
	readResidentOrder: (...args: unknown[]) => mockResident(...args),
	refreshOrderRecord: (...args: unknown[]) => mockRefresh(...args),
}));
jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({ warn: (...args: unknown[]) => mockWarn(...args) }),
}));
jest.mock('../../../hooks/use-app-info', () => ({
	useAppInfo: () => ({ license: { isPro: mockIsPro } }),
}));
jest.mock('../../../contexts/app-state', () => ({
	useStoreSession: () => ({ storeDB: mockStoreDB }),
}));
jest.mock('../../../contexts/translations', () => {
	const { createTestT } = jest.requireActual<typeof import('../../../../jest/translate')>(
		'../../../../jest/translate'
	);
	const t = createTestT();
	return { useT: () => t };
});

jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		testID,
		onPress,
	}: {
		children: React.ReactNode;
		testID?: string;
		onPress?: () => void;
	}) => (
		<button data-testid={testID} onClick={onPress}>
			{children}
		</button>
	),
	ButtonText: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/utils/open-external-url', () => ({ openExternalURL: jest.fn() }));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, testID }: { children: React.ReactNode; testID?: string }) => (
		<span data-testid={testID}>{children}</span>
	),
}));
function mockStack({ children, testID }: { children: React.ReactNode; testID?: string }) {
	return <div data-testid={testID}>{children}</div>;
}
jest.mock('@wcpos/components/hstack', () => ({ HStack: mockStack }));
jest.mock('@wcpos/components/vstack', () => ({ VStack: mockStack }));

addRxPlugin(RxDBLocalDocumentsPlugin);
beforeEach(async () => {
	jest.clearAllMocks();
	mockIsPro = true;
	mockResident.mockResolvedValue({ uuid: 'resident' });
	mockRefresh.mockResolvedValue('refreshed');
	mockStoreDB = (await createRxDatabase({
		name: `attention${Math.random().toString(36).slice(2)}`,
		storage: getRxStorageMemory(),
		localDocuments: true,
		multiInstance: false,
	})) as unknown as StoreDatabase;
});
afterEach(async () => {
	jest.restoreAllMocks();
	cleanup();
	await mockStoreDB.remove();
});

const ALREADY_PAID =
	'Order #1042 was already paid online; 10.00 Cash was also taken at the till — refund that payment.';
/** Refused at 10:0{minute}, so the newest-first order is the test's to name. */
const refuse = (rowId: string, minute = 0, message = ALREADY_PAID) => {
	jest.spyOn(Date.prototype, 'toISOString').mockReturnValueOnce(`2026-10-23T10:0${minute}:00.000Z`);
	return recordPaymentAttention(mockStoreDB, {
		rowId,
		orderUuid: `order-uuid-${rowId}`,
		orderId: 42,
		message,
	});
};
const drain = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
const rows = () =>
	screen
		.getAllByTestId(/^orders-attention-row-[^-]+$/)
		.map((row) => row.getAttribute('data-testid')?.replace('orders-attention-row-', ''));

it('renders nothing while no sale needs attention', async () => {
	render(<PaymentAttentionNotice />);
	await drain();
	expect(screen.queryByTestId('orders-attention')).toBeNull();
});

it('names one sale and shows the refusal sentence alone, which already names order, amount and tender', async () => {
	await refuse('a');
	render(<PaymentAttentionNotice />);
	expect((await screen.findByTestId('orders-attention-title')).textContent).toBe(
		'1 sale needs attention'
	);
	// The row is the sentence and the two actions: no second copy of the facts.
	expect(screen.getByTestId('orders-attention-row-a').textContent).toBe(
		`${ALREADY_PAID}Open orderHandled`
	);
	// Rule 4: a refused row is never retried on its own; no row offers it.
	expect(screen.queryByText(/retry/i)).toBeNull();
	expect(screen.queryByTestId('orders-attention-more')).toBeNull();
});

it('counts many sales, newest first, each row with its own refusal', async () => {
	await refuse('a', 1);
	await refuse('b', 2, 'Order #1043 could not accept the full payment; refund the difference.');
	render(<PaymentAttentionNotice />);
	expect((await screen.findByTestId('orders-attention-title')).textContent).toBe(
		'2 sales need attention'
	);
	expect(rows()).toEqual(['b', 'a']);
	expect(screen.getByTestId('orders-attention-row-b').textContent).toContain(
		'Order #1043 could not accept the full payment; refund the difference.'
	);
});

it('shows the newest three and counts the rest; handling one reveals the next', async () => {
	for (const [index, rowId] of ['a', 'b', 'c', 'd', 'e'].entries()) await refuse(rowId, index);
	render(<PaymentAttentionNotice />);
	expect((await screen.findByTestId('orders-attention-title')).textContent).toBe(
		'5 sales need attention'
	);
	expect(rows()).toEqual(['e', 'd', 'c']);
	expect(screen.getByTestId('orders-attention-more').textContent).toBe('and 2 more');
	fireEvent.click(screen.getByTestId('orders-attention-handled-e'));
	await waitFor(() => expect(rows()).toEqual(['d', 'c', 'b']));
	expect(screen.getByTestId('orders-attention-more').textContent).toBe('and 1 more');
});

it('Open order opens a resident order the way a row does', async () => {
	await refuse('a');
	render(<PaymentAttentionNotice />);
	fireEvent.click(await screen.findByTestId('orders-attention-open-a'));
	await waitFor(() => expect(mockSetParams).toHaveBeenCalledWith({ order: 'order-uuid-a' }));
	expect(mockResident).toHaveBeenCalledWith({ engine: 'engine' }, 'order-uuid-a');
	expect(mockRefresh).not.toHaveBeenCalled();
});

it('Open order demands an order not on this device from the store before opening it', async () => {
	mockResident.mockResolvedValue(null);
	let land!: (outcome: string) => void;
	mockRefresh.mockReturnValue(new Promise((resolve) => (land = resolve)));
	await refuse('a');
	render(<PaymentAttentionNotice />);
	fireEvent.click(await screen.findByTestId('orders-attention-open-a'));
	await waitFor(() => expect(mockRefresh).toHaveBeenCalledWith('engine', 42));
	expect(mockSetParams).not.toHaveBeenCalled();
	await act(async () => land('refreshed'));
	expect(mockSetParams).toHaveBeenCalledWith({ order: 'order-uuid-a' });
});

it('on Free offers only Handled: the pane would open behind the Pro preview', async () => {
	mockIsPro = false;
	await refuse('a');
	render(<PaymentAttentionNotice />);
	expect(await screen.findByTestId('orders-attention-handled-a')).toBeTruthy();
	expect(screen.queryByTestId('orders-attention-open-a')).toBeNull();
});

it('Handled deletes the entry and its row leaves', async () => {
	await refuse('a', 1);
	await refuse('b', 2);
	render(<PaymentAttentionNotice />);
	fireEvent.click(await screen.findByTestId('orders-attention-handled-a'));
	await waitFor(() => expect(screen.queryByTestId('orders-attention-row-a')).toBeNull());
	expect(screen.getByTestId('orders-attention-title').textContent).toBe('1 sale needs attention');
	fireEvent.click(screen.getByTestId('orders-attention-handled-b'));
	await waitFor(() => expect(screen.queryByTestId('orders-attention')).toBeNull());
});

it('a failed Handled warns and the row stays', async () => {
	await refuse('a');
	render(<PaymentAttentionNotice />);
	const handled = await screen.findByTestId('orders-attention-handled-a');
	jest.spyOn(mockStoreDB, 'getLocal').mockRejectedValue(new Error('disk full'));
	fireEvent.click(handled);
	await waitFor(() =>
		expect(mockWarn).toHaveBeenCalledWith('Could not mark a refused payment handled', {
			context: { paymentId: 'a', error: 'disk full' },
		})
	);
	expect(screen.getByTestId('orders-attention-row-a')).toBeTruthy();
});
