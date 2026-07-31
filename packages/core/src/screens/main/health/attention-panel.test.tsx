/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render, screen, waitFor } from '@testing-library/react';

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
jest.mock('@wcpos/query', () => ({ useQueryManager: () => ({ engine: mockEngine }) }));
jest.mock('../../../contexts/translations', () => ({
	useT: () => (_key: string, values?: Record<string, unknown>) => {
		let text = typeof values?.defaultValue === 'string' ? values.defaultValue : _key;
		for (const [name, value] of Object.entries(values ?? {})) {
			text = text.replace(`{${name}}`, String(value));
		}
		return text;
	},
}));
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
});
