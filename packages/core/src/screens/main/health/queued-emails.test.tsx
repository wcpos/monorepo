/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { QueuedEmailsPanel } from './queued-emails';

import type { QueuedEmail } from './use-queued-emails';

const mockDrain = jest.fn(async () => ({ sent: 1, failed: 0, deferred: 0 }));
const mockRetry = jest.fn(async () => true);
const mockRemove = jest.fn(async () => true);
const mockToast = jest.fn();
let rows: QueuedEmail[] = [];

type Kids = { children?: React.ReactNode };
type PressProps = Kids & { testID?: string; disabled?: boolean; onPress?: () => void };

jest.mock('@wcpos/components/button', () => ({
	Button: ({ children, testID, disabled, onPress }: PressProps) => (
		<button data-testid={testID} disabled={disabled} onClick={onPress} type="button">
			{children}
		</button>
	),
	ButtonText: ({ children }: Kids) => <>{children}</>,
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children, testID }: PressProps) => <div data-testid={testID}>{children}</div>,
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children, testID }: PressProps) => <div data-testid={testID}>{children}</div>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: Kids) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/toast', () => ({ Toast: { show: (a: unknown) => mockToast(a) } }));
jest.mock('./components', () => ({
	Callout: ({ children, testID }: PressProps) => <div data-testid={testID}>{children}</div>,
	Pill: ({ children, testID }: PressProps) => <span data-testid={testID}>{children}</span>,
}));
jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({
		info: () => undefined,
		debug: () => undefined,
		warn: () => undefined,
		error: () => undefined,
	}),
}));
jest.mock('../hooks/use-rest-http-client', () => ({
	useRestHttpClient: () => ({ post: jest.fn(async () => ({ data: { success: true } })) }),
}));
jest.mock('../receipt/email-queue/use-receipt-email-queue-collection', () => ({
	useReceiptEmailQueueCollection: () => ({ name: 'receipt_email_queue' }),
}));
jest.mock('../receipt/email-queue/queue', () => ({
	drainReceiptEmailQueue: (...args: unknown[]) => mockDrain(...(args as [])),
	receiptEmailPostRequest: (row: { orderId: number; email: string; saveTo?: string }) => [
		`/orders/${row.orderId}/email`,
		{ email: row.email, save_to: row.saveTo ?? '' },
	],
	retryReceiptEmail: (...args: unknown[]) => mockRetry(...(args as [])),
	removeReceiptEmail: (...args: unknown[]) => mockRemove(...(args as [])),
}));
jest.mock('./use-queued-emails', () => ({ useQueuedEmails: () => rows }));
jest.mock('./use-relative-time', () => ({
	useNowMs: () => 1_786_000_000_000,
	useRelativeTime: () => () => '5 minutes ago',
}));
jest.mock('../../../contexts/translations', () => {
	const { createTestT } = jest.requireActual<typeof import('../../../../jest/translate')>(
		'../../../../jest/translate'
	);
	return { useT: () => createTestT() };
});

const row = (over: Partial<QueuedEmail> = {}): QueuedEmail =>
	({
		doc: { localID: over.localID ?? 'row-1' },
		localID: 'row-1',
		orderId: 42,
		orderNumber: '1042',
		email: 'customer@example.com',
		status: 'pending',
		queuedAt: '2026-08-06T10:00:00.000Z',
		attempts: 0,
		...over,
	}) as QueuedEmail;

beforeEach(() => {
	jest.clearAllMocks();
	rows = [];
});

describe('QueuedEmailsPanel', () => {
	it('renders nothing when nothing is waiting', () => {
		const { container } = render(<QueuedEmailsPanel />);
		expect(container.firstChild).toBeNull();
	});

	it('lists a pending row with the address and the order it belongs to', () => {
		rows = [row()];
		render(<QueuedEmailsPanel />);

		expect(screen.getByTestId('db-queued-email-row-row-1')).toBeTruthy();
		expect(screen.getByTestId('db-queued-email-pending-row-1')).toBeTruthy();
		expect(screen.getByText(/customer@example\.com · #1042/)).toBeTruthy();
		expect(screen.getByText(/waiting for another send attempt/i)).toBeTruthy();
		expect(screen.getByText(/delivery is not guaranteed/i)).toBeTruthy();
	});

	it('shows the failure reason without assuming why the send failed', () => {
		rows = [row({ status: 'failed', attempts: 3, lastError: 'Invalid email address.' })];
		render(<QueuedEmailsPanel />);

		expect(screen.getByTestId('db-queued-email-failed-row-1')).toBeTruthy();
		expect(screen.getByTestId('db-queued-email-failed-row-1').textContent).toBe('failed');
		expect(screen.getByText('Invalid email address.')).toBeTruthy();
		expect(screen.getByText(/could not be sent and has stopped trying/i)).toBeTruthy();
		expect(screen.getByText(/review the reason below/i)).toBeTruthy();
		expect(screen.queryByText(/correct the order/i)).toBeNull();
	});

	it('uses neutral wording for multiple failed sends', () => {
		rows = [
			row({ localID: 'row-1', status: 'failed' }),
			row({ localID: 'row-2', orderId: 43, status: 'failed' }),
		];
		render(<QueuedEmailsPanel />);

		expect(screen.getByText(/2 of these could not be sent and have stopped trying/i)).toBeTruthy();
		expect(screen.getByText(/review the reasons below/i)).toBeTruthy();
	});

	it('requeues through the shared drain, so a retry cannot double-send', async () => {
		rows = [row({ status: 'failed', lastError: 'Invalid email address.' })];
		render(<QueuedEmailsPanel />);

		await act(async () => {
			fireEvent.click(screen.getByTestId('db-queued-email-retry-row-1'));
		});

		expect(mockRetry).toHaveBeenCalledTimes(1);
		expect(mockDrain).toHaveBeenCalledTimes(1);
	});

	it('offers no Send again on a pending row — it is already going to be retried', () => {
		rows = [row()];
		render(<QueuedEmailsPanel />);

		expect(screen.queryByTestId('db-queued-email-retry-row-1')).toBeNull();
		expect(screen.getByTestId('db-queued-email-remove-row-1')).toBeTruthy();
	});

	it('does not drain when the retry was refused because the row is no longer failed', async () => {
		mockRetry.mockResolvedValueOnce(false);
		rows = [row({ status: 'failed' })];
		render(<QueuedEmailsPanel />);

		await act(async () => {
			fireEvent.click(screen.getByTestId('db-queued-email-retry-row-1'));
		});

		expect(mockDrain).not.toHaveBeenCalled();
	});

	it('removes a row the merchant no longer wants sent', async () => {
		rows = [row({ status: 'failed' })];
		render(<QueuedEmailsPanel />);

		await act(async () => {
			fireEvent.click(screen.getByTestId('db-queued-email-remove-row-1'));
		});

		expect(mockRemove).toHaveBeenCalledTimes(1);
		expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
	});

	it('warns instead of claiming removal when delivery has already started', async () => {
		mockRemove.mockResolvedValueOnce(false);
		rows = [row()];
		render(<QueuedEmailsPanel />);

		await act(async () => {
			fireEvent.click(screen.getByTestId('db-queued-email-remove-row-1'));
		});

		expect(mockToast).toHaveBeenCalledWith(
			expect.objectContaining({ type: 'warning', text1: expect.stringMatching(/already started/i) })
		);
		expect(mockToast).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
	});
});
