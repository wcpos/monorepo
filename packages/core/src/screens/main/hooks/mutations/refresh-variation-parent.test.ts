/**
 * A variable parent's price range is recomputed server-side on every read, so the
 * parent row is stale the moment a child's price write lands — and nothing pulls
 * it. These lock the two properties that make the repair correct rather than
 * merely present: it waits for the server's verdict before fetching (a fetch at
 * enqueue time would re-materialize the PRE-edit range over the parent), and a
 * write that never lands fetches nothing at all.
 */
import { affectsParentPriceRange, refreshVariationParent } from './refresh-variation-parent';

const mockAwaitWriteOutcome = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('@wcpos/query', () => ({
	awaitWriteOutcome: (...args: unknown[]) => mockAwaitWriteOutcome(...args),
}));

jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({ error: (...args: unknown[]) => mockLoggerError(...args) }),
	getErrorMessage: (error: unknown) => String(error),
}));

type Engine = Parameters<typeof refreshVariationParent>[0];

const variation = (parentId: unknown) => ({ payload: { id: 100, parent_id: parentId } });

function engineStub({ readyRejects = false }: { readyRejects?: boolean } = {}) {
	const release = jest.fn();
	const require = jest.fn(() => ({
		ready: readyRejects ? Promise.reject(new Error('offline')) : Promise.resolve(),
		release,
	}));
	return {
		engine: { require, events: jest.fn(), sync: jest.fn() } as unknown as Engine,
		require,
		release,
	};
}

beforeEach(() => {
	jest.clearAllMocks();
	mockAwaitWriteOutcome.mockResolvedValue('success');
});

describe('affectsParentPriceRange', () => {
	it.each([['regular_price'], ['sale_price'], ['price']])('is true for %s', (field) => {
		expect(affectsParentPriceRange({ [field]: '10' })).toBe(true);
	});

	it('is false for a change that leaves the range alone', () => {
		expect(affectsParentPriceRange({ barcode: 'ABC', stock_quantity: 3 })).toBe(false);
	});

	it('is false for no changes at all', () => {
		expect(affectsParentPriceRange(undefined)).toBe(false);
		expect(affectsParentPriceRange({})).toBe(false);
	});

	it('is true for an empty-string price — clearing a sale price moves the range', () => {
		expect(affectsParentPriceRange({ sale_price: '' })).toBe(true);
	});
});

describe('refreshVariationParent', () => {
	it('fetches the parent by id, forced, after the write is acknowledged', async () => {
		const { engine, require, release } = engineStub();

		await refreshVariationParent(engine, {
			document: variation(41),
			changes: { regular_price: '69' },
			mutationId: 'mutation-1',
		});

		expect(mockAwaitWriteOutcome).toHaveBeenCalledWith(engine, 'mutation-1');
		expect(require).toHaveBeenCalledWith({
			id: 'variation-parent:refresh:41',
			collection: 'products',
			kind: 'targeted-records',
			remoteIds: ['41'],
			forceRefresh: true,
		});
		expect(release).toHaveBeenCalledTimes(1);
	});

	it('waits for the acknowledgement BEFORE declaring the requirement', async () => {
		const { engine, require } = engineStub();
		let acknowledge!: () => void;
		mockAwaitWriteOutcome.mockReturnValue(
			new Promise<void>((resolve) => {
				acknowledge = () => resolve();
			})
		);

		const pending = refreshVariationParent(engine, {
			document: variation(41),
			changes: { sale_price: '5' },
			mutationId: 'mutation-1',
		});
		await Promise.resolve();
		// The pre-edit range is still what the server would serve here.
		expect(require).not.toHaveBeenCalled();

		acknowledge();
		await pending;
		expect(require).toHaveBeenCalledTimes(1);
	});

	it('fetches nothing when the write never lands', async () => {
		const { engine, require } = engineStub();
		mockAwaitWriteOutcome.mockRejectedValue(new Error('Timed out waiting for mutation'));

		await refreshVariationParent(engine, {
			document: variation(41),
			changes: { regular_price: '69' },
			mutationId: 'mutation-1',
		});

		expect(require).not.toHaveBeenCalled();
	});

	it('prefers the post-acknowledgement parent id over the pre-write one', async () => {
		const { engine, require } = engineStub();
		const document = {
			// A resident stored before `parent_id` joined the variation schema.
			payload: { id: 100 },
			getLatest: () => ({ payload: { id: 100, parent_id: 41 } }),
		};

		await refreshVariationParent(engine, {
			document,
			changes: { regular_price: '69' },
			mutationId: 'mutation-1',
		});

		expect(require).toHaveBeenCalledWith(
			expect.objectContaining({ remoteIds: ['41'], forceRefresh: true })
		);
	});

	it('falls back to the pre-write parent id when the ack re-materialized nothing', async () => {
		const { engine, require } = engineStub();
		const document = { payload: { id: 100, parent_id: 41 }, getLatest: () => ({ payload: {} }) };

		await refreshVariationParent(engine, {
			document,
			changes: { regular_price: '69' },
			mutationId: 'mutation-1',
		});

		expect(require).toHaveBeenCalledWith(expect.objectContaining({ remoteIds: ['41'] }));
	});

	it('does nothing for a change the parent range is not derived from', async () => {
		const { engine, require } = engineStub();

		await refreshVariationParent(engine, {
			document: variation(41),
			changes: { barcode: 'ABC' },
			mutationId: 'mutation-1',
		});

		expect(mockAwaitWriteOutcome).not.toHaveBeenCalled();
		expect(require).not.toHaveBeenCalled();
	});

	it.each([[0], [undefined], ['not-an-id']])(
		'does nothing when parent_id is %p',
		async (parentId) => {
			const { engine, require } = engineStub();

			await refreshVariationParent(engine, {
				document: variation(parentId),
				changes: { regular_price: '69' },
				mutationId: 'mutation-1',
			});

			expect(require).not.toHaveBeenCalled();
		}
	);

	it('releases the requirement and logs without a toast when the fetch fails', async () => {
		const { engine, release } = engineStub({ readyRejects: true });

		await refreshVariationParent(engine, {
			document: variation(41),
			changes: { regular_price: '69' },
			mutationId: 'mutation-1',
		});

		expect(release).toHaveBeenCalledTimes(1);
		expect(mockLoggerError).toHaveBeenCalledTimes(1);
		expect(mockLoggerError.mock.calls[0][1]).not.toHaveProperty('showToast', true);
	});
});
