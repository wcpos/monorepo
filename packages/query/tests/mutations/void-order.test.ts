import { voidOrder } from '../../src/mutations/void-order';

const mockPatchAndEnqueue = jest.fn();
const mockRequestDelete = jest.fn();
jest.mock('../../src/mutations/resident', () => ({
	findEngineResident: jest.fn(),
	insertEngineResident: jest.fn(),
	patchAndEnqueueEngineResident: (...args: unknown[]) => mockPatchAndEnqueue(...args),
	patchEngineResident: jest.fn(),
}));
jest.mock('../../src/mutations/request-server-delete', () => ({
	requestServerDelete: (...args: unknown[]) => mockRequestDelete(...args),
}));

const status = jest.fn(() => ({ connectivity: 'offline' }));
const manager = { engine: { status, resolveConflict: jest.fn() } } as unknown as Parameters<
	typeof voidOrder
>[0];
const undone = () => false;

beforeEach(() => {
	jest.clearAllMocks();
	mockPatchAndEnqueue.mockResolvedValue(undefined);
	mockRequestDelete.mockResolvedValue({ mutationId: 'm1', annihilated: false });
});

it("keeps a sent invoice's order: cancelled on the store, never a delete", async () => {
	expect(await voidOrder(manager, { recordId: 'a', registerId: 'r1', undone, keep: true })).toEqual(
		{ kind: 'kept-cancelled' }
	);
	expect(mockPatchAndEnqueue).toHaveBeenCalledWith({
		manager,
		collection: 'orders',
		recordId: 'a',
		changes: { status: 'cancelled' },
		registerId: 'r1',
	});
	expect(mockRequestDelete).not.toHaveBeenCalled();
});

it('without keep, a void is still the delete it was', async () => {
	expect(await voidOrder(manager, { recordId: 'a', registerId: 'r1', undone })).toEqual({
		kind: 'removed',
		confirmed: false,
		late: null,
	});
	expect(mockRequestDelete).toHaveBeenCalledWith(manager.engine, {
		collection: 'orders',
		recordId: 'a',
	});
	expect(mockPatchAndEnqueue).not.toHaveBeenCalled();
});
