/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render } from '@testing-library/react';

import { RejectedMutationsPanel } from './rejected-mutations';

import type { RejectedMutation } from './use-rejected-mutations';

const mockResolveConflict = jest.fn(async () => undefined);
const mockToast = jest.fn();
let rows: RejectedMutation[] = [];

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
	useRelativeTime: () => () => '2 months ago',
}));
jest.mock('./use-rejected-mutations', () => ({ useRejectedMutations: () => rows }));

function row(over: Partial<RejectedMutation> = {}): RejectedMutation {
	return {
		mutationId: 'm-1',
		collectionName: 'orders',
		recordId: '22222222-2222-4222-8222-222222222222',
		operation: 'create',
		label: '#1042 · 25.00',
		reason: 'rest_invalid_email',
		message: 'Invalid parameter(s): billing',
		status: 400,
		rejectedAt: '2026-01-05T00:00:01.000Z',
		requeueCount: 0,
		residentMissing: false,
		destroysRecord: false,
		mayDestroyRecord: false,
		residentUnknown: false,
		...over,
	};
}

/** Click + flush the state updates the async resolution schedules. */
async function press(element: HTMLElement): Promise<void> {
	await act(async () => {
		fireEvent.click(element);
	});
}

describe('RejectedMutationsPanel', () => {
	beforeEach(() => {
		rows = [row()];
		mockResolveConflict.mockClear();
		mockToast.mockClear();
	});

	it('renders nothing when there are no dead letters', () => {
		rows = [];

		expect(render(<RejectedMutationsPanel />).queryByTestId('db-rejected')).toBeNull();
	});

	it("names the record and states the server's own verdict", () => {
		const { getByTestId } = render(<RejectedMutationsPanel />);

		const listed = getByTestId('db-rejected-row-m-1');
		expect(listed.textContent).toContain('#1042 · 25.00');
		expect(listed.textContent).toContain(
			'400 · rest_invalid_email · Invalid parameter(s): billing'
		);
		expect(listed.textContent).toContain('refused 2 months ago');
	});

	it('requeues a row through the rebuild resolution — no confirm, it is the safe action', async () => {
		const { getByTestId } = render(<RejectedMutationsPanel />);

		await press(getByTestId('db-rejected-requeue-m-1'));

		expect(mockResolveConflict).toHaveBeenCalledWith('m-1', 'requeue-rebuilt');
	});

	it('never discards on a single press — the destructive action needs the confirm step', async () => {
		const { getByTestId, queryByTestId } = render(<RejectedMutationsPanel />);

		expect(queryByTestId('db-rejected-discard-confirm')).toBeNull();
		await press(getByTestId('db-rejected-discard-m-1'));
		expect(mockResolveConflict).not.toHaveBeenCalled();

		await press(getByTestId('db-rejected-discard-confirm'));
		expect(mockResolveConflict).toHaveBeenCalledWith('m-1', 'discard');
	});

	it('says outright that discarding a born-local record DELETES it (#832 R7b)', async () => {
		rows = [row({ destroysRecord: true })];
		const { getByTestId } = render(<RejectedMutationsPanel />);

		await press(getByTestId('db-rejected-discard-m-1'));

		const confirm = getByTestId('db-rejected-discard-confirm');
		// The confirm states destruction and names the record; it must never
		// reassure the cashier that their server's version will be kept — there
		// isn't one.
		expect(document.body.textContent).toContain('permanently deletes it from this device');
		expect(document.body.textContent).toContain('never saved to your store');
		expect(document.body.textContent).toContain('#1042 · 25.00');
		expect(document.body.textContent).not.toContain('your server’s version is kept');
		expect(confirm.textContent).toContain('Delete');

		await press(confirm);
		expect(mockResolveConflict).toHaveBeenCalledWith('m-1', 'discard');
		// …and the success toast says the record is gone, not that "a change" was dropped.
		expect(mockToast).toHaveBeenCalledWith(
			expect.objectContaining({ type: 'success', text1: 'Deleted from this device.' })
		);
	});

	it('never promises deletion for a create the SERVER may already hold', async () => {
		// `identity-ambiguous` means the uuid matched more than one server record, so
		// the engine keeps the resident. `destroysRecord` is false there, and the
		// dialog must not promise a deletion the engine will not perform.
		rows = [row({ destroysRecord: false, reason: 'identity-ambiguous', status: 409 })];
		const { getByTestId } = render(<RejectedMutationsPanel />);

		await press(getByTestId('db-rejected-discard-m-1'));

		expect(document.body.textContent).not.toContain('permanently deletes it from this device');
		expect(getByTestId('db-rejected-discard-confirm').textContent).toContain('Discard');
	});

	it('states the CONDITION when deletion depends on what the server still has', async () => {
		// The engine re-fetches the server document for a non-order row and removes
		// the resident when the server 404s. The client cannot know that answer
		// without the request, so the copy must state the condition rather than
		// promise "your server's version is kept" and then delete the record.
		rows = [row({ operation: 'update', collectionName: 'products', mayDestroyRecord: true })];
		const { getByTestId } = render(<RejectedMutationsPanel />);

		await press(getByTestId('db-rejected-discard-m-1'));

		expect(document.body.textContent).toContain('If your server no longer has');
		expect(document.body.textContent).toContain('also deletes it from this device');
		expect(document.body.textContent).not.toContain('permanently deletes it from this device');
	});

	it('disables discard while the resident read failed — the outcome is unknown', async () => {
		// Not `residentMissing` (a successful read finding nothing) but a FAILED
		// read: whether discard destroys the record is unknowable, so every confirm
		// we could show might describe the wrong outcome.
		rows = [row({ residentUnknown: true })];
		const { getByTestId } = render(<RejectedMutationsPanel />);

		expect((getByTestId('db-rejected-discard-m-1') as HTMLButtonElement).disabled).toBe(true);
		expect(getByTestId('db-rejected-row-m-1').textContent).toContain('couldn’t read the record');
	});

	it('keeps the non-destructive copy when the record survives the discard', async () => {
		rows = [row({ operation: 'update' })];
		const { getByTestId } = render(<RejectedMutationsPanel />);

		await press(getByTestId('db-rejected-discard-m-1'));

		expect(document.body.textContent).toContain('your server’s version is kept');
		expect(document.body.textContent).not.toContain('permanently deletes it from this device');
		expect(getByTestId('db-rejected-discard-confirm').textContent).toContain('Discard');
	});

	it('disables requeue when the record is gone — there is nothing left to rebuild from', () => {
		rows = [row({ residentMissing: true })];
		const { getByTestId } = render(<RejectedMutationsPanel />);

		expect((getByTestId('db-rejected-requeue-m-1') as HTMLButtonElement).disabled).toBe(true);
		expect((getByTestId('db-rejected-discard-m-1') as HTMLButtonElement).disabled).toBe(false);
	});

	it('shows how many recoveries a row has already survived', () => {
		rows = [row({ requeueCount: 2 })];
		const { getByTestId } = render(<RejectedMutationsPanel />);

		expect(getByTestId('db-rejected-tries-m-1').textContent).toContain('2');
	});

	it('surfaces a failed resolution instead of silently doing nothing', async () => {
		mockResolveConflict.mockRejectedValueOnce(new Error('record is no longer on this device'));
		const { getByTestId } = render(<RejectedMutationsPanel />);

		await press(getByTestId('db-rejected-requeue-m-1'));

		expect(mockToast).toHaveBeenCalledWith(
			expect.objectContaining({ type: 'error', text2: 'record is no longer on this device' })
		);
	});

	it('shows follower deferral as information instead of a failure', async () => {
		const error = new Error('resolveConflict deferred');
		error.name = 'WritePlaneFollowerError';
		mockResolveConflict.mockRejectedValueOnce(error);
		const { getByTestId } = render(<RejectedMutationsPanel />);

		await press(getByTestId('db-rejected-requeue-m-1'));

		expect(mockToast).toHaveBeenCalledWith({
			type: 'info',
			text1: 'Another tab is completing this — switch to it or wait.',
		});
		expect(mockToast).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
	});
});
