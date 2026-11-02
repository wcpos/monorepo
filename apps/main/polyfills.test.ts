import { Blob as NodeBlob } from 'node:buffer';

jest.mock('expo-crypto', () => ({}));
jest.mock('expo-blob', () => ({ Blob: jest.requireActual('node:buffer').Blob }));

const originalFetch = globalThis.fetch;
const originalBlob = globalThis.Blob;
const originalAtob = globalThis.atob;
const upstream = jest.fn();

beforeEach(() => {
	jest.resetModules();
	upstream.mockReset().mockResolvedValue({ upstream: true });
	globalThis.fetch = upstream;
	globalThis.Blob = NodeBlob as unknown as typeof Blob;
	// Exercise the app's decoding path, not Node's binary-safe atob.
	globalThis.atob = undefined as unknown as typeof atob;
	jest.requireActual('./polyfills');
});

afterEach(() => {
	globalThis.fetch = originalFetch;
	globalThis.Blob = originalBlob;
	globalThis.atob = originalAtob;
});

it('round-trips every binary byte and preserves the declared attachment MIME type', async () => {
	const bytes = Uint8Array.from({ length: 256 }, (_, index) => index);
	const response = await fetch(
		`data:application/octet-stream;base64,${Buffer.from(bytes).toString('base64')}`
	);
	const blob = await response.blob();
	expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
	expect(blob.type).toBe('application/octet-stream');
	expect(response.headers.get('Content-Type')).toBe('application/octet-stream');
	expect(upstream).not.toHaveBeenCalled();
});

it('delegates other URLs and init unchanged to the fetch captured at installation', async () => {
	const init = { method: 'POST', body: 'payload' };
	for (const input of [
		'https://example.test/api',
		new URL('https://example.test/url'),
		new Request('https://example.test/request'),
		'data:text/plain,hello',
	]) {
		await expect(fetch(input, init)).resolves.toEqual({ upstream: true });
		expect(upstream).toHaveBeenLastCalledWith(input, init);
	}
});
