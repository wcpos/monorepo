/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, waitFor } from '@testing-library/react';

import { ConflictedMutationsPanel } from './conflicted-mutations';

import type { UnresolvedConflict } from './use-unresolved-conflicts';

const mockResolveConflict = jest.fn(async () => undefined);
const mockToast = jest.fn();
const mockSync = jest.fn(async () => undefined);
const mockPush = jest.fn();
let rows: UnresolvedConflict[] = [];
let readError = false;

type Kids = { children?: React.ReactNode };
type PressProps = Kids & { testID?: string; disabled?: boolean; onPress?: () => void };

jest.mock('@wcpos/components/alert-dialog', () => {
	function Passthrough({ children }: Kids) {
		return <>{children}</>;
	}
	return {
		// Only render the dialog's contents when it is actually open, so a test that
		// presses "confirm" without opening it would fail.
		AlertDialog: ({ children, open }: Kids & { open?: boolean }) => (open ? <>{children}</> : null),
		AlertDialogContent: Passthrough,
		AlertDialogDescription: Passthrough,
		AlertDialogFooter: Passthrough,
		AlertDialogHeader: Passthrough,
		AlertDialogTitle: Passthrough,
		AlertDialogCancel: ({ children, testID }: PressProps) => (
			<button data-testid={testID}>{children}</button>
		),
		AlertDialogAction: ({ children, testID, onPress }: PressProps) => (
			<button data-testid={testID} onClick={onPress}>
				{children}
			</button>
		),
	};
});
jest.mock('@wcpos/components/button', () => ({
	Button: ({ children, testID, disabled, onPress }: PressProps) => (
		<button data-testid={testID} disabled={disabled} onClick={onPress}>
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
jest.mock('expo-router', () => ({
	useRouter: () => ({ push: mockPush }),
}));
jest.mock('@wcpos/query', () => ({
	COLLECTION_VOCABULARY: jest.requireActual('@wcpos/query').COLLECTION_VOCABULARY,
	useQueryRuntime: () => ({ engine: { resolveConflict: mockResolveConflict } }),
}));
jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));
jest.mock('../../../contexts/translations', () => {
	const { createTestT } = jest.requireActual<typeof import('../../../../jest/translate')>(
		'../../../../jest/translate'
	);
	return { useT: () => createTestT() };
});
jest.mock('./use-relative-time', () => ({
	useNowMs: () => 1_767_225_600_000,
	useRelativeTime: () => () => '2 minutes ago',
}));
jest.mock('./use-manual-sync', () => ({
	useManualSync: () => ({ syncing: false, sync: mockSync }),
}));
jest.mock('./use-unresolved-conflicts', () => ({
	useUnresolvedConflicts: () => ({ rows, readError }),
}));

function row(over: Partial<UnresolvedConflict> = {}): UnresolvedConflict {
	return {
		mutationId: 'm-1',
		collectionName: 'products',
		recordId: '8752430f-d36b-4e81-ac7e-36df56a71d1d',
		operation: 'update',
		label: 'Aether Gym Pant',
		queuedAt: '2026-08-14T16:30:00.000Z',
		status: 'conflicted',
		...over,
	};
}

describe('ConflictedMutationsPanel', () => {
	beforeEach(() => {
		rows = [];
		readError = false;
		mockResolveConflict.mockReset();
		mockResolveConflict.mockImplementation(async () => undefined);
		mockToast.mockReset();
		mockSync.mockReset();
		mockPush.mockReset();
	});

	it('renders nothing when there are no parked rows', () => {
		const { container } = render(<ConflictedMutationsPanel />);
		expect(container.firstChild).toBeNull();
	});

	it('names the record — never an anonymous count', () => {
		rows = [row()];
		const { getByTestId } = render(<ConflictedMutationsPanel />);
		expect(getByTestId('db-conflicted-row-m-1').textContent).toContain('Aether Gym Pant');
	});

	it('Send again resolves retry-with-server-base and kicks a drain', async () => {
		rows = [row()];
		const { getByTestId } = render(<ConflictedMutationsPanel />);

		fireEvent.click(getByTestId('db-conflicted-resend-m-1'));

		await waitFor(() =>
			expect(mockResolveConflict).toHaveBeenCalledWith('m-1', 'retry-with-server-base')
		);
		await waitFor(() => expect(mockSync).toHaveBeenCalled());
		expect(mockToast).toHaveBeenCalledWith(
			expect.objectContaining({ type: 'success', text1: 'Queued to send again.' })
		);
	});

	it('Use server version discards only after the confirm', async () => {
		rows = [row()];
		const { getByTestId } = render(<ConflictedMutationsPanel />);

		fireEvent.click(getByTestId('db-conflicted-discard-m-1'));
		expect(mockResolveConflict).not.toHaveBeenCalled();

		fireEvent.click(getByTestId('db-conflicted-discard-confirm'));

		await waitFor(() => expect(mockResolveConflict).toHaveBeenCalledWith('m-1', 'discard'));
		// Accepting the server's copy queues no push — a drain kick would imply one.
		expect(mockSync).not.toHaveBeenCalled();
	});

	it('resending a delete demands its own confirm', async () => {
		rows = [row({ operation: 'delete' })];
		const { getByTestId } = render(<ConflictedMutationsPanel />);

		fireEvent.click(getByTestId('db-conflicted-resend-m-1'));
		expect(mockResolveConflict).not.toHaveBeenCalled();

		fireEvent.click(getByTestId('db-conflicted-resend-delete-confirm'));

		await waitFor(() =>
			expect(mockResolveConflict).toHaveBeenCalledWith('m-1', 'retry-with-server-base')
		);
	});

	it('a follower tab is told to defer, not shown a failure', async () => {
		rows = [row()];
		const error = new Error('not the leader');
		error.name = 'WritePlaneFollowerError';
		mockResolveConflict.mockRejectedValueOnce(error);
		const { getByTestId } = render(<ConflictedMutationsPanel />);

		fireEvent.click(getByTestId('db-conflicted-resend-m-1'));

		await waitFor(() =>
			expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'info' }))
		);
		expect(mockSync).not.toHaveBeenCalled();
	});

	it('a failed resolution surfaces as an error toast and the row stays', async () => {
		rows = [row()];
		mockResolveConflict.mockRejectedValueOnce(new Error('storage fault'));
		const { getByTestId } = render(<ConflictedMutationsPanel />);

		fireEvent.click(getByTestId('db-conflicted-resend-m-1'));

		await waitFor(() =>
			expect(mockToast).toHaveBeenCalledWith(
				expect.objectContaining({ type: 'error', text2: 'storage fault' })
			)
		);
		expect(getByTestId('db-conflicted-row-m-1')).toBeTruthy();
	});

	it('Open record routes to the collection edit surface', () => {
		rows = [row()];
		const { getByTestId } = render(<ConflictedMutationsPanel />);

		fireEvent.click(getByTestId('db-conflicted-open-m-1'));

		expect(mockPush).toHaveBeenCalledWith(
			'/(app)/(drawer)/products/(modals)/edit/product/8752430f-d36b-4e81-ac7e-36df56a71d1d'
		);
	});

	it('"cannot read held changes" never renders as "no held changes"', () => {
		readError = true;
		const { getByTestId } = render(<ConflictedMutationsPanel />);
		expect(getByTestId('db-conflicted-read-error')).toBeTruthy();
	});
});
