/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { Toast } from '@wcpos/components/toast';

import { AttentionPanel } from './attention-panel';

import type { StuckRecord } from '../logs/logs-logic';

const mockExec = jest.fn();
const mockSync = jest.fn();
const mockPush = jest.fn();
const mockEngine = {
	active: jest.fn(() => ({
		database: {
			collections: {
				products: { findOne: () => ({ exec: mockExec }) },
				variations: { findOne: () => ({ exec: mockExec }) },
				customers: { findOne: () => ({ exec: mockExec }) },
			},
		},
	})),
	sync: mockSync,
};

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@wcpos/query', () => ({
	COLLECTION_VOCABULARY: jest.requireActual('@wcpos/query').COLLECTION_VOCABULARY,
	useQueryRuntime: () => ({ engine: mockEngine }),
}));
jest.mock('../../../contexts/translations', () => {
	const { createTestT } = jest.requireActual<typeof import('../../../../jest/translate')>(
		'../../../../jest/translate'
	);
	return { useT: () => createTestT() };
});
jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		testID,
		onPress,
		loading,
		disabled,
	}: {
		children: React.ReactNode;
		testID?: string;
		onPress?: () => void;
		loading?: boolean;
		disabled?: boolean;
	}) => (
		<button
			data-testid={testID}
			onClick={onPress}
			disabled={disabled || loading}
			data-loading={loading ? 'true' : 'false'}
		>
			{children}
		</button>
	),
	ButtonText: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@wcpos/components/toast', () => ({
	Toast: { show: jest.fn() },
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
jest.mock('./components', () => ({
	Callout: ({ children, testID }: { children: React.ReactNode; testID?: string }) => (
		<div data-testid={testID}>{children}</div>
	),
}));

const stuck = (collection: string, retryable: boolean): StuckRecord => ({
	key: `${collection}:record-uuid`,
	collection,
	recordId: 'record-uuid',
	reason: 'server rejected it',
	lastSeen: 1,
	attempts: 1,
	eventType: retryable ? 'push.error' : 'push.conflict',
	direction: 'push',
	retryable,
});

describe('AttentionPanel', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it.each([
		['products', { payload: { name: 'Coffee' } }, 'Coffee'],
		['variations', { payload: { name: 'Coffee — Large' } }, 'Coffee — Large'],
		[
			'customers',
			{ payload: { first_name: 'Ada', last_name: 'Lovelace', username: 'ada' } },
			'Ada Lovelace',
		],
	] as const)('reads the %s label from the engine payload', async (collection, doc, label) => {
		mockExec.mockResolvedValue(doc);

		render(<AttentionPanel stuck={[stuck(collection, true)]} />);

		await waitFor(() =>
			expect(screen.getByTestId('db-attention-panel').textContent).toContain(label)
		);
	});

	it('offers Retry for a retryable push failure', () => {
		mockExec.mockResolvedValue(null);

		render(<AttentionPanel stuck={[stuck('products', true)]} />);

		expect(screen.getByTestId('db-attention-retry')).not.toBeNull();
	});

	it('does not offer Retry for a terminal stuck record', () => {
		mockExec.mockResolvedValue(null);

		render(<AttentionPanel stuck={[stuck('products', false)]} />);

		expect(screen.queryByTestId('db-attention-retry')).toBeNull();
	});

	it('surfaces a failed sync report from Retry as an error toast', async () => {
		mockExec.mockResolvedValue(null);
		// engine.sync() reports failure on the returned report, it does not throw.
		mockSync.mockResolvedValue({ lane: 'all', status: 'error', error: 'HTTP 502' });

		render(<AttentionPanel stuck={[stuck('products', true)]} />);
		fireEvent.click(screen.getByTestId('db-attention-retry'));

		await waitFor(() =>
			expect(Toast.show).toHaveBeenCalledWith({
				type: 'error',
				text1: 'Couldn’t sync with the server.',
				text2: 'HTTP 502',
			})
		);
		expect(mockSync).toHaveBeenCalledTimes(1);
	});

	it('surfaces a skipped sync report from Retry as a warning toast', async () => {
		mockExec.mockResolvedValue(null);
		mockSync.mockResolvedValue({ lane: 'all', status: 'skipped', reason: 'offline' });

		render(<AttentionPanel stuck={[stuck('products', true)]} />);
		fireEvent.click(screen.getByTestId('db-attention-retry'));

		await waitFor(() =>
			expect(Toast.show).toHaveBeenCalledWith({
				type: 'warning',
				text1: 'Sync didn’t run.',
				text2: 'This device is offline.',
			})
		);
		expect(mockSync).toHaveBeenCalledTimes(1);
	});

	it('spins while the retry sync is in flight and stays quiet on success', async () => {
		mockExec.mockResolvedValue(null);
		let finish!: (report: unknown) => void;
		mockSync.mockReturnValue(
			new Promise((resolve) => {
				finish = resolve;
			})
		);

		render(<AttentionPanel stuck={[stuck('products', true)]} />);
		const retry = () => screen.getByTestId('db-attention-retry');
		expect(retry().getAttribute('data-loading')).toBe('false');

		fireEvent.click(retry());
		await waitFor(() => expect(retry().getAttribute('data-loading')).toBe('true'));

		finish({ lane: 'all', status: 'ran' });
		await waitFor(() => expect(retry().getAttribute('data-loading')).toBe('false'));
		expect(Toast.show).not.toHaveBeenCalled();
	});
});
