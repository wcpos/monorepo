/**
 * @jest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react';

import { useOtherScopes } from './use-other-scopes';

const mockEngine = {
	active: jest.fn(),
	ready: Promise.resolve({ database: { name: '' } }),
	status: jest.fn(() => ({ activeScopeId: 'scope-1' })),
	statusChanges: jest.fn(() => () => undefined),
};

jest.mock('@wcpos/query', () => ({
	COLLECTION_VOCABULARY: jest.requireActual('@wcpos/query').COLLECTION_VOCABULARY,
	useQueryRuntime: () => ({ engine: mockEngine }),
}));

type TestFileHandle = { kind: 'file'; getFile(): Promise<{ size: number }> };
type TestDirectoryHandle = {
	kind: 'directory';
	values(): AsyncIterable<TestFileHandle | TestDirectoryHandle>;
	entries(): AsyncIterable<[string, TestFileHandle | TestDirectoryHandle]>;
};

const file = (size: number): TestFileHandle => ({
	kind: 'file',
	getFile: async () => ({ size }),
});

const directory = (
	entries: [string, TestFileHandle | TestDirectoryHandle][]
): TestDirectoryHandle => ({
	kind: 'directory',
	async *values() {
		for (const [, handle] of entries) yield handle;
	},
	async *entries() {
		for (const entry of entries) yield entry;
	},
});

describe('useOtherScopes', () => {
	const originalStorage = Object.getOwnPropertyDescriptor(navigator, 'storage');

	afterEach(() => {
		if (originalStorage) {
			Object.defineProperty(navigator, 'storage', originalStorage);
		} else {
			Reflect.deleteProperty(navigator, 'storage');
		}
	});

	it('waits for the active scope before classifying OPFS databases', async () => {
		let resolveReady!: (scope: { database: { name: string } }) => void;
		mockEngine.active.mockReturnValue(null);
		mockEngine.ready = new Promise((resolve) => {
			resolveReady = resolve;
		});
		const root = directory([
			['rxdb-pos_v6_abcdefabcdef_s578_c12', directory([['active', file(100)]])],
			['rxdb-pos_v6_abcdefabcdef_s600_c12', directory([['other', file(25)]])],
		]);
		const getDirectory = jest.fn(async () => root);
		Object.defineProperty(navigator, 'storage', {
			configurable: true,
			value: { getDirectory },
		});

		const { result } = renderHook(() => useOtherScopes());

		expect(getDirectory).not.toHaveBeenCalled();

		await act(async () => {
			resolveReady({ database: { name: 'pos_v6_abcdefabcdef_s578_c12' } });
		});

		await waitFor(() =>
			expect(result.current).toEqual({ storeCount: 1, bytes: 25, sameStoreOtherCashierBytes: 0 })
		);
	});
});
