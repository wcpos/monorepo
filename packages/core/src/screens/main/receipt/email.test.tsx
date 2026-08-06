/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { EmailForm } from './email';

import type { ReceiptEmailRow } from './email-queue/queue';

const mockPost = jest.fn();
const mockToast = jest.fn();
const mockLoggerError = jest.fn();
const mockLoggerSuccess = jest.fn();
let onlineStatus = 'online-website-available';
let queueRows: ReceiptEmailRow[] = [];
let queueCollection: unknown = null;

type Kids = { children?: React.ReactNode };
type PressProps = Kids & { testID?: string; disabled?: boolean; onPress?: () => void };

/** A collection stand-in with the two methods `enqueueReceiptEmail` uses. */
function createQueue() {
	return {
		insert: jest.fn(async (row: ReceiptEmailRow) => {
			queueRows.push(row);
			return row;
		}),
		find: () => ({
			exec: async () => queueRows.filter((row) => row.status === 'pending'),
		}),
	};
}

jest.mock('@wcpos/components/dialog', () => ({
	DialogAction: ({ children, testID, onPress }: PressProps) => (
		<button data-testid={testID} onClick={onPress} type="button">
			{children}
		</button>
	),
	DialogClose: ({ children }: Kids) => <span>{children}</span>,
	DialogFooter: ({ children }: Kids) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/form', () => {
	const actualReact = jest.requireActual<typeof import('react')>('react');
	return {
		Form: ({ children }: Kids) => <>{children}</>,
		FormField: ({
			render,
			control,
			name,
		}: {
			render: (arg: {
				field: { value: unknown; onChange: (value: unknown) => void };
			}) => React.ReactElement;
			control: { _defaultValues?: Record<string, unknown> };
			name: string;
		}) =>
			render({
				field: {
					value: control?._defaultValues?.[name],
					onChange: () => undefined,
				},
			}) ?? actualReact.createElement('span'),
		FormInput: ({ label }: { label?: string }) => <span>{label}</span>,
		FormSwitch: ({ label }: { label?: string }) => <span>{label}</span>,
	};
});
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, testID }: PressProps) => <span data-testid={testID}>{children}</span>,
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: Kids) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/toast', () => ({ Toast: { show: (a: unknown) => mockToast(a) } }));
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: onlineStatus }),
}));
jest.mock('@wcpos/utils/logger', () => ({
	// Lazy wrappers: `getLogger` runs at module load, before the mock consts above
	// are initialized.
	getLogger: () => ({
		info: () => undefined,
		debug: () => undefined,
		warn: () => undefined,
		error: (...args: unknown[]) => mockLoggerError(...args),
		success: (...args: unknown[]) => mockLoggerSuccess(...args),
	}),
}));
jest.mock('../components/form-errors', () => ({ FormErrors: () => null }));
jest.mock('../hooks/use-rest-http-client', () => ({
	useRestHttpClient: () => ({ post: mockPost }),
}));
jest.mock('./email-queue/use-receipt-email-queue-collection', () => ({
	useReceiptEmailQueueCollection: () => queueCollection,
}));
jest.mock('../../../contexts/translations', () => {
	const { createTestT } = jest.requireActual<typeof import('../../../../jest/translate')>(
		'../../../../jest/translate'
	);
	return { useT: () => createTestT() };
});

const order = {
	id$: new BehaviorSubject<number | undefined>(42),
	number$: new BehaviorSubject<string | undefined>('1042'),
	billing: { email: 'customer@example.com' },
} as unknown as import('@wcpos/database').OrderDocument;

const send = async () => {
	await act(async () => {
		fireEvent.click(screen.getByTestId('receipt-email-send'));
	});
};

beforeEach(() => {
	jest.clearAllMocks();
	queueRows = [];
	queueCollection = createQueue();
	onlineStatus = 'online-website-available';
});

describe('EmailForm', () => {
	it('queues the email and posts nothing when the till is offline', async () => {
		onlineStatus = 'offline';
		render(<EmailForm order={order} />);

		expect(screen.getByTestId('receipt-email-offline-notice')).toBeTruthy();
		await send();

		expect(mockPost).not.toHaveBeenCalled();
		expect(queueRows).toHaveLength(1);
		expect(queueRows[0]).toMatchObject({
			orderId: 42,
			orderNumber: '1042',
			email: 'customer@example.com',
			status: 'pending',
			attempts: 0,
		});
		expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
	});

	it('queues when the store is unreachable even though the device has a network', async () => {
		onlineStatus = 'online-website-unavailable';
		render(<EmailForm order={order} />);
		await send();

		expect(mockPost).not.toHaveBeenCalled();
		expect(queueRows).toHaveLength(1);
	});

	it('posts straight away when online and reports success', async () => {
		mockPost.mockResolvedValue({ data: { success: true } });
		render(<EmailForm order={order} />);
		await send();

		expect(mockPost).toHaveBeenCalledWith('/orders/42/email', {
			email: 'customer@example.com',
			save_to: '',
		});
		expect(queueRows).toHaveLength(0);
		expect(mockLoggerSuccess).toHaveBeenCalled();
	});

	it('queues an online send that failed on the connection', async () => {
		mockPost.mockRejectedValue(
			Object.assign(new Error('Network Error'), { isAxiosError: true, code: 'ERR_NETWORK' })
		);
		render(<EmailForm order={order} />);
		await send();

		expect(queueRows).toHaveLength(1);
		expect(mockLoggerError).not.toHaveBeenCalled();
	});

	it('surfaces a rejected address immediately instead of queuing it', async () => {
		mockPost.mockRejectedValue(
			Object.assign(new Error('Invalid email address.'), {
				isAxiosError: true,
				response: { status: 400, data: { message: 'Invalid email address.' } },
				wpMessage: 'Invalid email address.',
			})
		);
		render(<EmailForm order={order} />);
		await send();

		expect(queueRows).toHaveLength(0);
		expect(mockLoggerError).toHaveBeenCalledWith(
			'Failed to send receipt email',
			expect.objectContaining({ showToast: true })
		);
	});

	it('surfaces a 200 that did not send, rather than promising to retry it', async () => {
		mockPost.mockResolvedValue({ data: { success: false, message: 'No template configured.' } });
		render(<EmailForm order={order} />);
		await send();

		expect(queueRows).toHaveLength(0);
		expect(mockLoggerError).toHaveBeenCalled();
	});

	it('falls back to surfacing the error when there is no queue to write to', async () => {
		queueCollection = null;
		onlineStatus = 'offline';
		mockPost.mockRejectedValue(
			Object.assign(new Error('No internet connection'), {
				isPreFlightBlocked: true,
				errorCode: 'API01007',
			})
		);
		render(<EmailForm order={order} />);
		await send();

		expect(mockLoggerError).toHaveBeenCalled();
	});
});
