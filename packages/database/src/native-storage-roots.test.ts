const mockRoots: Record<string, { name: string; size: number; delete: jest.Mock }[]> = {};
class MockFile {
	constructor(
		public name: string,
		public size: number
	) {}
	delete = jest.fn();
}
class MockDirectory {
	name: string;
	uri: string;
	constructor(_parent: unknown, name: string) {
		this.name = name;
		this.uri = name;
	}
	get exists() {
		return this.name in mockRoots;
	}
	list() {
		return mockRoots[this.name];
	}
}
jest.mock('expo-file-system', () => ({
	Directory: MockDirectory,
	File: MockFile,
	Paths: { document: { uri: 'file:///documents/' } },
}));
jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({ debug: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

beforeEach(() => {
	jest.resetModules();
	for (const root of ['.expo-opfs', '.worklet-opfs']) {
		mockRoots[root] = [
			new MockFile('rxdb-wcposusers_v6-sites-0', 10),
			new MockFile('rxdb-wcposusers_v4-sites-0', 20),
			new MockFile('unrelated', 30),
		];
	}
});

it('measures both roots, including equal database names without dropping bytes', async () => {
	const { measureAppStorage } = await import('./measure-storage');
	const footprint = await measureAppStorage();
	expect(footprint?.entries).toHaveLength(4);
	expect(footprint?.entries.reduce((sum, entry) => sum + entry.bytes, 0)).toBe(60);
});

it('clears application databases from both roots but leaves unrelated entries', async () => {
	const { clearAllDB } = await import('./clear-all-db');
	await expect(clearAllDB()).resolves.toEqual(expect.objectContaining({ databasesDeleted: 4 }));
	for (const entries of Object.values(mockRoots)) {
		expect(entries[0].delete).toHaveBeenCalledTimes(1);
		expect(entries[1].delete).toHaveBeenCalledTimes(1);
		expect(entries[2].delete).not.toHaveBeenCalled();
	}
});

it('purges only legacy entries in both roots', async () => {
	const { purgeLegacyDatabases } = await import('./purge-legacy-db');
	await expect(purgeLegacyDatabases()).resolves.toEqual(
		expect.objectContaining({ databasesDeleted: 2 })
	);
	for (const entries of Object.values(mockRoots)) {
		expect(entries[0].delete).not.toHaveBeenCalled();
		expect(entries[1].delete).toHaveBeenCalledTimes(1);
		expect(entries[2].delete).not.toHaveBeenCalled();
	}
});
