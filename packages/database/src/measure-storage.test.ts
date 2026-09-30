class MockFile {
	constructor(
		public name: string,
		public size: number
	) {}
}
const contents: Record<string, (MockFile | MockDirectory)[]> = {};
class MockDirectory {
	name: string;
	constructor(...parts: unknown[]) {
		this.name = String(parts.at(-1));
	}
	get exists() {
		return this.name in contents;
	}
	list() {
		return contents[this.name];
	}
}
jest.mock('expo-file-system', () => ({
	Directory: MockDirectory,
	File: MockFile,
	Paths: { document: 'document-dir' },
}));

it('counts the SQLite root as live and both retired roots as legacy, including nested bytes', async () => {
	contents['wcpos-sqlite'] = [
		new MockFile('wcposusers_v8', 100),
		new MockFile('wcposusers_v8-wal', 23),
	];
	contents['.expo-opfs'] = [
		new MockDirectory('rxdb-pos_v5_shop-orders-0'),
		new MockFile('other', 2),
	];
	contents['rxdb-pos_v5_shop-orders-0'] = [new MockFile('documents.json', 10)];
	contents.SQLite = [new MockFile('store_v7_shop.db', 20)];
	const { measureAppStorage } = await import('./measure-storage');
	expect((await measureAppStorage())?.entries).toEqual([
		{ name: 'wcpos-sqlite', root: 'sqlite', bytes: 123 },
		{ name: '.expo-opfs', legacy: true, bytes: 12 },
		{ name: 'SQLite', legacy: true, bytes: 20 },
	]);
});
