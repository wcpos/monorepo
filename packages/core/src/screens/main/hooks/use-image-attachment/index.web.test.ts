/**
 * @jest-environment jsdom
 */
/* eslint-disable import/first */

const mockGet = jest.fn();

jest.mock('@wcpos/hooks/use-http-client', () => ({
	useHttpClient: () => ({ get: mockGet }),
}));

jest.mock('rxdb', () => ({
	isRxDocument: (doc: unknown) => !!doc,
}));

import { act, renderHook } from '@testing-library/react';

import { useImageAttachment } from './index.web';

type DocumentArg = Parameters<typeof useImageAttachment>[0];

interface Deferred<T> {
	promise: Promise<T>;
	resolve: (value: T) => void;
}

function defer<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

/**
 * jsdom doesn't implement object URLs. Tag each one with the blob's MIME
 * subtype so assertions can tell which image a URL belongs to.
 */
let objectUrlCount = 0;
beforeAll(() => {
	URL.createObjectURL = jest.fn(
		(blob: Blob) => `blob:${blob.type.replace('image/', '')}-${objectUrlCount++}`
	);
	URL.revokeObjectURL = jest.fn();
});

beforeEach(() => {
	jest.clearAllMocks();
});

function makeDocument({ attachments = {} }: { attachments?: Record<string, Blob> } = {}) {
	return {
		getAttachment: jest.fn((id: string) => {
			const blob = attachments[id];
			return blob ? { getData: () => Promise.resolve(blob) } : null;
		}),
		putAttachment: jest.fn(() => Promise.resolve()),
	} as unknown as DocumentArg;
}

function makeImageResponse(subtype: string) {
	return {
		status: 200,
		statusText: 'OK',
		headers: { 'content-type': `image/${subtype}` },
		data: new ArrayBuffer(8),
	};
}

describe('useImageAttachment (web)', () => {
	it('loads an existing attachment into an object URL', async () => {
		const document = makeDocument({
			attachments: { 'red.jpg': new Blob(['red'], { type: 'image/red' }) },
		});

		const { result } = renderHook(({ doc, url }) => useImageAttachment(doc, url), {
			initialProps: { doc: document, url: 'red.jpg' },
		});

		await act(async () => {});

		expect(result.current.uri).toMatch(/^blob:red/);
	});

	it('does not show the previous image while the next one is loading', async () => {
		const redFetch = defer<ReturnType<typeof makeImageResponse>>();
		mockGet.mockReturnValueOnce(redFetch.promise);

		const document = makeDocument();
		const { result, rerender } = renderHook(({ doc, url }) => useImageAttachment(doc, url), {
			initialProps: { doc: document, url: 'red.jpg' },
		});

		// Red finishes loading and is displayed.
		await act(async () => {
			redFetch.resolve(makeImageResponse('red'));
		});
		expect(result.current.uri).toMatch(/^blob:red/);

		// The row is reused for a different variation (rows are keyed by index,
		// so the hook instance survives the swap). Blue is still loading.
		const blueFetch = defer<ReturnType<typeof makeImageResponse>>();
		mockGet.mockReturnValueOnce(blueFetch.promise);
		rerender({ doc: document, url: 'blue.jpg' });

		// The red image must not linger on the blue variation's row.
		expect(result.current.uri).toBeUndefined();

		await act(async () => {
			blueFetch.resolve(makeImageResponse('blue'));
		});
		expect(result.current.uri).toMatch(/^blob:blue/);
	});

	it('ignores a stale load that resolves after the image source has changed', async () => {
		// Red is not cached: it goes through a slow network fetch.
		const redFetch = defer<ReturnType<typeof makeImageResponse>>();
		mockGet.mockReturnValueOnce(redFetch.promise);

		const document = makeDocument({
			attachments: { 'blue.jpg': new Blob(['blue'], { type: 'image/blue' }) },
		});

		const { result, rerender } = renderHook(({ doc, url }) => useImageAttachment(doc, url), {
			initialProps: { doc: document, url: 'red.jpg' },
		});

		// Before red's fetch resolves, the row swaps to blue, which is already
		// cached as an attachment and resolves immediately.
		rerender({ doc: document, url: 'blue.jpg' });
		await act(async () => {});
		expect(result.current.uri).toMatch(/^blob:blue/);

		// Red's stale fetch finally resolves. It must not overwrite blue.
		await act(async () => {
			redFetch.resolve(makeImageResponse('red'));
		});
		expect(result.current.uri).toMatch(/^blob:blue/);
		expect(result.current.isLoading).toBe(false);
	});
});
