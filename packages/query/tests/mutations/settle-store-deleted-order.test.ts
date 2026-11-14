import { settleStoreDeletedOrder } from '../../src/mutations/settle-store-deleted-order';

const mockFind = jest.fn();
const mockRebirth = jest.fn();
const mockRecreate = jest.fn();
jest.mock('../../src/mutations/resident', () => ({
	findEngineResident: (...args: unknown[]) => mockFind(...args),
	rebirthOrderResident: (...args: unknown[]) => mockRebirth(...args),
	recreateRebornOrder: (...args: unknown[]) => mockRecreate(...args),
	residentPayload: (resident: { toMutableJSON(): { payload: unknown } }) =>
		resident.toMutableJSON().payload,
}));

const resolveConflict = jest.fn();
const manager = { engine: { resolveConflict } } as unknown as Parameters<
	typeof settleStoreDeletedOrder
>[0];
const abandoned = jest.fn(() => false);
const input = { recordId: 'a', mutationId: 'm1', abandoned };
const resident = (status: string, remoteId: string | null = '33827') => ({
	toJSON: () => ({ remoteId }),
	toMutableJSON: () => ({ payload: { id: 33827, status, number: '33827' } }),
});

beforeEach(() => {
	jest.resetAllMocks();
	mockFind.mockResolvedValue(resident('pos-open'));
	mockRebirth.mockResolvedValue(resident('pos-open', null));
	mockRecreate.mockResolvedValue(undefined);
	resolveConflict.mockResolvedValue(undefined);
	abandoned.mockReturnValue(false);
});

it.each([
	['33827', false],
	[null, true],
])(
	'rebirths, discards, then recreates an open cart with remoteId %s',
	async (remoteId, alreadyReborn) => {
		mockFind.mockResolvedValue(resident('pos-open', remoteId));
		expect(await settleStoreDeletedOrder(manager, input)).toEqual({
			kind: 'recreated',
			number: '33827',
			alreadyReborn,
		});
		expect(mockFind).toHaveBeenCalledWith(manager, 'orders', 'a');
		expect(mockRebirth).toHaveBeenCalledWith(manager, 'a');
		expect(resolveConflict).toHaveBeenCalledWith('m1', 'discard');
		expect(mockRecreate).toHaveBeenCalledWith(manager, 'a');
		expect(mockFind.mock.invocationCallOrder[0]).toBeLessThan(
			mockRebirth.mock.invocationCallOrder[0]
		);
		expect(mockRebirth.mock.invocationCallOrder[0]).toBeLessThan(
			resolveConflict.mock.invocationCallOrder[0]
		);
		expect(resolveConflict.mock.invocationCallOrder[0]).toBeLessThan(
			mockRecreate.mock.invocationCallOrder[0]
		);
	}
);

it.each(['completed', 'pos-partial', 'pending', 'processing', 'custom'])(
	'discards %s without recreating',
	async (status) => {
		mockFind.mockResolvedValue(resident(status));
		expect(await settleStoreDeletedOrder(manager, input)).toEqual({
			kind: 'removed',
			number: '33827',
		});
		expect(resolveConflict).toHaveBeenCalledWith('m1', 'discard');
		expect(mockRebirth).not.toHaveBeenCalled();
		expect(mockRecreate).not.toHaveBeenCalled();
	}
);

it('discards an absent resident', async () => {
	mockFind.mockResolvedValue(null);
	expect(await settleStoreDeletedOrder(manager, input)).toEqual({ kind: 'absent' });
	expect(resolveConflict).toHaveBeenCalledWith('m1', 'discard');
	expect(mockRebirth).not.toHaveBeenCalled();
	expect(mockRecreate).not.toHaveBeenCalled();
});

it('abandons after the find without rebirthing or discarding', async () => {
	mockFind.mockImplementation(async () => {
		abandoned.mockReturnValue(true);
		return resident('pos-open');
	});
	expect(await settleStoreDeletedOrder(manager, input)).toEqual({ kind: 'abandoned' });
	expect(mockFind).toHaveBeenCalledWith(manager, 'orders', 'a');
	expect(mockRebirth).not.toHaveBeenCalled();
	expect(resolveConflict).not.toHaveBeenCalled();
	expect(mockRecreate).not.toHaveBeenCalled();
});

it('abandons after the rebirth without discarding', async () => {
	mockRebirth.mockImplementation(async () => {
		abandoned.mockReturnValue(true);
		return resident('pos-open', null);
	});
	expect(await settleStoreDeletedOrder(manager, input)).toEqual({ kind: 'abandoned' });
	expect(mockRebirth).toHaveBeenCalledWith(manager, 'a');
	expect(resolveConflict).not.toHaveBeenCalled();
	expect(mockRecreate).not.toHaveBeenCalled();
});

it('abandons after the discard without recreating', async () => {
	resolveConflict.mockImplementation(async () => {
		abandoned.mockReturnValue(true);
	});
	expect(await settleStoreDeletedOrder(manager, input)).toEqual({ kind: 'abandoned' });
	expect(mockRebirth).toHaveBeenCalledWith(manager, 'a');
	expect(resolveConflict).toHaveBeenCalledWith('m1', 'discard');
	expect(mockRecreate).not.toHaveBeenCalled();
});
