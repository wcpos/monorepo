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
let mockStoreDB: StoreDatabase;
jest.mock('expo-router', () => ({ useRouter: () => ({ setParams: mockSetParams }) }));
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
	mockStoreDB = (await createRxDatabase({
		name: `attention${Math.random().toString(36).slice(2)}`,
		storage: getRxStorageMemory(),
		localDocuments: true,
		multiInstance: false,
	})) as unknown as StoreDatabase;
});
afterEach(async () => {
	cleanup();
	await mockStoreDB.remove();
});

const ALREADY_PAID =
	'Order #1042 was already paid online; 10.00 Cash was also taken at the till — refund that payment.';
const refuse = (rowId: string, message = ALREADY_PAID) =>
	recordPaymentAttention(mockStoreDB, {
		rowId,
		orderUuid: `order-uuid-${rowId}`,
		orderId: 42,
		orderNumber: '1042',
		amount: '10.00',
		currency: 'USD',
		methodId: 'pos_cash',
		methodTitle: 'Cash',
		reason: 'order_already_paid',
		message,
	});
const drain = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

it('renders nothing while no sale needs attention', async () => {
	render(<PaymentAttentionNotice />);
	await drain();
	expect(screen.queryByTestId('orders-attention')).toBeNull();
});

it('names one sale and shows the refusal sentence alone, which already names order, amount and tender', async () => {
	await refuse('row-a');
	render(<PaymentAttentionNotice />);
	expect((await screen.findByTestId('orders-attention-title')).textContent).toBe(
		'1 sale needs attention'
	);
	// The row is the sentence and the two actions: no second copy of the facts.
	expect(screen.getByTestId('orders-attention-row-row-a').textContent).toBe(
		`${ALREADY_PAID}Open orderHandled`
	);
	// Rule 4: a refused row is never retried on its own; no row offers it.
	expect(screen.queryByText(/retry/i)).toBeNull();
});

it('counts many sales, each row with its own refusal', async () => {
	await refuse('row-a');
	await refuse('row-b', 'Order #1043 could not accept the full payment; refund the difference.');
	render(<PaymentAttentionNotice />);
	expect((await screen.findByTestId('orders-attention-title')).textContent).toBe(
		'2 sales need attention'
	);
	expect(screen.getByTestId('orders-attention-row-row-b').textContent).toContain(
		'Order #1043 could not accept the full payment; refund the difference.'
	);
});

it('Open order opens the order the way a row does', async () => {
	await refuse('row-a');
	render(<PaymentAttentionNotice />);
	fireEvent.click(await screen.findByTestId('orders-attention-open-row-a'));
	expect(mockSetParams).toHaveBeenCalledWith({ order: 'order-uuid-row-a' });
});

it('Handled resolves the entry and its row leaves', async () => {
	await refuse('row-a');
	await refuse('row-b');
	render(<PaymentAttentionNotice />);
	fireEvent.click(await screen.findByTestId('orders-attention-handled-row-a'));
	await waitFor(() => expect(screen.queryByTestId('orders-attention-row-row-a')).toBeNull());
	expect(screen.getByTestId('orders-attention-row-row-b')).toBeTruthy();
	expect(screen.getByTestId('orders-attention-title').textContent).toBe('1 sale needs attention');
	fireEvent.click(screen.getByTestId('orders-attention-handled-row-b'));
	await waitFor(() => expect(screen.queryByTestId('orders-attention')).toBeNull());
});
