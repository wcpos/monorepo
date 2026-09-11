/** @jest-environment jsdom */
import { renderHook } from '@testing-library/react';

import {
	noteStorageWriteDeadlinePassed,
	STORAGE_WRITE_DEADLINE_MS,
} from '@wcpos/database/plugins/wrapped-error-handler-storage';
import { WriteOutcomeError } from '@wcpos/query';

import {
	clearOrderSaving,
	getOrderSaveState,
	markOrderSaveRejected,
	markOrderSaving,
	resetCheckoutMode,
} from '../checkout-mode';
import { useCheckoutSave } from './use-checkout-save';

jest.mock('@wcpos/database/plugins/wrapped-error-handler-storage', () => ({
	...jest.requireActual('@wcpos/database/plugins/wrapped-error-handler-storage'),
	noteStorageWriteDeadlinePassed: jest.fn(),
}));

const mockSettlement = jest.fn();
const mockTerminal = jest.fn();
const mockEnqueue = jest.fn();
const mockResident = { uuid: 'a' };
const mockError = jest.fn();
jest.mock('@wcpos/query', () => ({
	WriteOutcomeError: jest.requireActual('@wcpos/query').WriteOutcomeError,
	useQueryRuntime: () => ({ engine: {} }),
	awaitWriteSettlement: (...args: unknown[]) => mockSettlement(...args),
	awaitTerminalWriteOutcome: (...args: unknown[]) => mockTerminal(...args),
}));
jest.mock('../../../contexts/use-push-document', () => ({
	enqueueDocumentWrite: (...args: unknown[]) => mockEnqueue(...args),
}));
jest.mock('../../../hooks/mutations/use-local-mutation', () => ({
	findEngineResident: async () => mockResident,
}));
jest.mock('../../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({ error: (...args: unknown[]) => mockError(...args) }),
}));
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: 'online-website-available' }),
}));
const record = { uuid: 'a' } as Parameters<ReturnType<typeof useCheckoutSave>>[0];
const rejection = { status: 403, reason: 'refused', message: 'No permission' };
const refused = () => new WriteOutcomeError('write-rejected', 'm', 403, 'refused', 'No permission');
beforeEach(() => {
	jest.clearAllMocks();
	resetCheckoutMode();
	markOrderSaving('a');
	mockEnqueue.mockResolvedValue({
		collectionName: 'orders',
		recordId: 'a',
		receipt: { mutationId: 'm' },
	});
});
it.each(['success', 'success-local'])(
	'clears a %s save and returns the resident',
	async (outcome) => {
		mockSettlement.mockResolvedValue(outcome);
		const { result } = renderHook(useCheckoutSave);
		await expect(result.current(record, { onLateRejected: jest.fn() })).resolves.toEqual({
			outcome: 'saved',
			resident: mockResident,
		});
		expect(getOrderSaveState('a')).toBeNull();
	}
);
it('returns immediate rejection without throwing or toasting', async () => {
	mockSettlement.mockRejectedValue(refused());
	const { result } = renderHook(useCheckoutSave);
	await expect(result.current(record, { onLateRejected: jest.fn() })).resolves.toEqual({
		outcome: 'rejected',
		rejection,
	});
	expect(getOrderSaveState('a')).toEqual({ kind: 'rejected', ...rejection });
	expect(mockError).not.toHaveBeenCalled();
});
it.each(['ack', 'reject', 'durable-first-reject', 'stale-ack', 'stale-reject'])(
	'handles offline continuation: %s',
	async (outcome) => {
		let acknowledge!: () => void;
		let reject!: (error: unknown) => void;
		mockTerminal.mockReturnValue(
			new Promise<void>((resolve, fail) => {
				acknowledge = resolve;
				reject = fail;
			})
		);
		mockSettlement.mockResolvedValue('queued-offline');
		const onLateRejected = jest.fn();
		const { result } = renderHook(useCheckoutSave);
		await expect(result.current(record, { onLateRejected })).resolves.toEqual({
			outcome: 'queued-offline',
		});
		expect(getOrderSaveState('a')).toEqual({ kind: 'queued-offline', mutationId: 'm' });
		if (outcome.startsWith('stale')) markOrderSaving('a');
		// The queue subscription can mark the dead letter before the terminal event lands.
		if (outcome === 'durable-first-reject') markOrderSaveRejected('a', rejection);
		if (outcome.endsWith('reject')) reject(refused());
		else acknowledge();
		await Promise.resolve();
		expect(getOrderSaveState('a')).toEqual(
			outcome.startsWith('stale')
				? { kind: 'saving' }
				: outcome === 'ack'
					? null
					: { kind: 'rejected', ...rejection }
		);
		if (outcome.endsWith('reject') && !outcome.startsWith('stale'))
			expect(onLateRejected).toHaveBeenCalledWith(rejection);
		else expect(onLateRejected).not.toHaveBeenCalled();
	}
);
it('clears, toasts once and rethrows a non-terminal failure', async () => {
	mockEnqueue.mockRejectedValueOnce(new Error('storage failed'));
	const { result } = renderHook(useCheckoutSave);
	await expect(result.current(record, { onLateRejected: jest.fn() })).rejects.toThrow(
		'storage failed'
	);
	expect(getOrderSaveState('a')).toBeNull();
	expect(mockError).toHaveBeenCalledWith(
		'Checkout save failed',
		expect.objectContaining({ showToast: true })
	);
	clearOrderSaving('a');
});

describe('local enqueue deadline', () => {
	beforeEach(() => jest.useFakeTimers());
	afterEach(() => jest.useRealTimers());

	it('signals once for a pending enqueue without settling or retrying it', async () => {
		mockEnqueue.mockReturnValue(new Promise(() => {}));
		const { result } = renderHook(useCheckoutSave);
		const settled = jest.fn();
		void result.current(record, { onLateRejected: jest.fn() }).then(settled, settled);
		await jest.advanceTimersByTimeAsync(STORAGE_WRITE_DEADLINE_MS - 1);
		expect(noteStorageWriteDeadlinePassed).not.toHaveBeenCalled();
		await jest.advanceTimersByTimeAsync(1);
		expect(noteStorageWriteDeadlinePassed).toHaveBeenCalledWith({
			waitedMs: STORAGE_WRITE_DEADLINE_MS,
			orderId: 'a',
		});
		await jest.advanceTimersByTimeAsync(STORAGE_WRITE_DEADLINE_MS);
		expect(noteStorageWriteDeadlinePassed).toHaveBeenCalledTimes(1);
		expect(settled).not.toHaveBeenCalled();
		expect(mockEnqueue).toHaveBeenCalledTimes(1);
	});

	it('disarms when enqueue resolves even if server settlement stays pending', async () => {
		mockSettlement.mockReturnValue(new Promise(() => {}));
		const { result } = renderHook(useCheckoutSave);
		void result.current(record, { onLateRejected: jest.fn() });
		await jest.advanceTimersByTimeAsync(STORAGE_WRITE_DEADLINE_MS * 2);
		expect(mockSettlement).toHaveBeenCalledTimes(1);
		expect(noteStorageWriteDeadlinePassed).not.toHaveBeenCalled();
	});
});
