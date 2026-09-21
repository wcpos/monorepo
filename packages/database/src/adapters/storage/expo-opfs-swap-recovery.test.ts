const mockFiles = new Map<string, { bytes: Uint8Array; modified: number }>();
const mockDirectories = new Set<string>();
const mockOperations = jest.fn();
const mockUri = (...parts: (string | { uri: string })[]) =>
	parts.map((part) => (typeof part === 'string' ? part : part.uri).replace(/\/$/, '')).join('/');

class MockFile {
	uri: string;
	constructor(...parts: (string | { uri: string })[]) {
		this.uri = mockUri(...parts);
	}
	get name() {
		return this.uri.split('/').pop()!;
	}
	get exists() {
		mockOperations('exists', this.uri);
		return mockFiles.has(this.uri);
	}
	get size() {
		mockOperations('size', this.uri);
		return mockFiles.get(this.uri)?.bytes.length ?? 0;
	}
	get modificationTime() {
		mockOperations('modificationTime', this.uri);
		return mockFiles.get(this.uri)?.modified ?? null;
	}
	create() {
		mockOperations('create', this.uri);
		if (this.exists) throw new Error('File exists');
		mockFiles.set(this.uri, { bytes: new Uint8Array(), modified: Date.now() });
	}
	delete() {
		mockOperations('delete', this.uri);
		mockFiles.delete(this.uri);
	}
	copySync(destination: MockFile) {
		mockOperations('copySync', this.uri, destination.uri);
		if (destination.exists) throw new Error('Destination exists');
		const source = mockFiles.get(this.uri)!;
		mockFiles.set(destination.uri, { ...source, bytes: source.bytes.slice() });
	}
	moveSync(destination: MockFile, options?: { overwrite?: boolean }) {
		mockOperations('moveSync', this.uri, destination.uri, options);
		if (destination.exists && !options?.overwrite) throw new Error('Destination exists');
		// Native overwrite removes the destination without calling the JS delete method.
		mockFiles.delete(destination.uri);
		mockFiles.set(destination.uri, mockFiles.get(this.uri)!);
		mockFiles.delete(this.uri);
		this.uri = destination.uri;
	}
	open() {
		mockOperations('open', this.uri);
		const entry = mockFiles.get(this.uri);
		if (!entry) throw new Error('File missing');
		return {
			offset: 0,
			get size() {
				return entry.bytes.length;
			},
			readBytes(length: number) {
				const result = entry.bytes.slice(this.offset, this.offset + length);
				this.offset += result.length;
				return result;
			},
			writeBytes(bytes: Uint8Array) {
				const next = new Uint8Array(Math.max(entry.bytes.length, this.offset + bytes.length));
				next.set(entry.bytes);
				next.set(bytes, this.offset);
				entry.bytes = next;
				this.offset += bytes.length;
			},
			close() {},
		};
	}
}

class MockDirectory {
	uri: string;
	constructor(...parts: (string | { uri: string })[]) {
		this.uri = mockUri(...parts) + '/';
	}
	get exists() {
		mockOperations('exists', this.uri);
		return mockDirectories.has(this.uri);
	}
	create() {
		mockOperations('create', this.uri);
		mockDirectories.add(this.uri);
	}
	list() {
		mockOperations('list', this.uri);
		return [...mockFiles.keys()]
			.filter((uri) => uri.startsWith(this.uri) && !uri.slice(this.uri.length).includes('/'))
			.map((uri) => new MockFile(uri));
	}
}

jest.mock('expo-file-system', () => ({
	File: MockFile,
	Directory: MockDirectory,
	Paths: { document: 'document' },
}));

describe('expo-opfs swap recovery', () => {
	let directory: import('expo-opfs').FileSystemDirectoryHandle;
	const target = 'document/.expo-opfs/documents.json';
	const seed = (uri: string, text: string, modified = 0) =>
		mockFiles.set(uri, { bytes: new TextEncoder().encode(text), modified });
	const swaps = () => [...mockFiles.keys()].filter((uri) => uri.startsWith(target + '.swap.'));

	beforeEach(async () => {
		mockFiles.clear();
		mockDirectories.clear();
		mockOperations.mockClear();
		jest.resetModules();
		directory = await (await import('expo-opfs')).opfs.getDirectory();
	});

	it('commits new bytes without deleting the target from JS', async () => {
		seed(target, 'old data');
		const handle = await directory.getFileHandle('documents.json');
		const writable = await handle.createWritable({ keepExistingData: true });
		await writable.write('new');
		expect(await (await handle.getFile()).text()).toBe('old data');
		await writable.close();
		expect(await (await handle.getFile()).text()).toBe('new data');
		expect(swaps()).toEqual([]);
		expect(mockOperations).not.toHaveBeenCalledWith('delete', target);
		expect(mockOperations).toHaveBeenCalledWith('copySync', target, expect.any(String));
		expect(mockOperations).toHaveBeenCalledWith('moveSync', expect.any(String), target, {
			overwrite: true,
		});
	});

	it.each([undefined, { create: true }])(
		'recovers the newest timestamp before open (%j)',
		async (options) => {
			// Random text can end in digits: those digits are not part of Date.now().
			seed(target + '.swap.z91780000000000', 'older', 9999999999999);
			seed(target + '.swap.a11780000000001', 'newest', 1);
			const handle = await directory.getFileHandle('documents.json', options);
			expect(await (await handle.getFile()).text()).toBe('newest');
			expect(swaps()).toEqual([]);
			expect(mockOperations).not.toHaveBeenCalledWith('create', target);
			const access = await handle.createSyncAccessHandle();
			const bytes = new Uint8Array(6);
			access.read(bytes);
			access.close();
			expect(new TextDecoder().decode(bytes)).toBe('newest');
		}
	);

	it('uses modificationTime when the timestamp suffix cannot be parsed', async () => {
		seed(target + '.swap.unknown', 'newest', 1780000000001);
		seed(target + '.swap.a1780000000000', 'older', 1);
		const handle = await directory.getFileHandle('documents.json');
		expect(await (await handle.getFile()).text()).toBe('newest');
		expect(swaps()).toEqual([]);
	});

	it('leaves an existing target and its stale swap untouched', async () => {
		seed(target, 'live');
		const swap = target + '.swap.a1780000000001';
		seed(swap, 'stale');
		const handle = await directory.getFileHandle('documents.json', { create: true });
		expect(await (await handle.getFile()).text()).toBe('live');
		expect(swaps()).toEqual([swap]);
		expect(new TextDecoder().decode(mockFiles.get(swap)!.bytes)).toBe('stale');
		expect(mockOperations).not.toHaveBeenCalledWith('list', expect.any(String));
	});
});
