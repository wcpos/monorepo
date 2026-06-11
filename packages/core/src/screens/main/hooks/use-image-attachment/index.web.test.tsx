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

import * as React from 'react';

import '@testing-library/jest-dom';
import { act, render, screen } from '@testing-library/react';

import { ERROR_RETRY_DELAY_MS, useImageAttachment } from './index.web';

type DocumentArg = Parameters<typeof useImageAttachment>[0];

interface Deferred<T> {
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (reason: Error) => void;
}

function defer<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	let reject!: (reason: Error) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

/**
 * jsdom doesn't implement object URLs. Tag each one with the blob's MIME
 * subtype so assertions can tell which image a URL belongs to.
 */
beforeAll(() => {
	URL.createObjectURL = jest.fn((blob: Blob) => `blob:${blob.type.replace('image/', '')}`);
	URL.revokeObjectURL = jest.fn();
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

function Probe({ doc, url }: { doc: DocumentArg; url: string }) {
	const { uri, error } = useImageAttachment(doc, url);
	if (error) {
		return <div>{`error:${error.message}`}</div>;
	}
	return <div>{uri ?? 'blank'}</div>;
}

function probeTree(doc: DocumentArg, url: string) {
	return (
		<React.Suspense fallback={<div>loading</div>}>
			<Probe doc={doc} url={url} />
		</React.Suspense>
	);
}

/**
 * The image resource cache is module-level and survives between tests, so
 * every test uses its own image URLs.
 */
describe('useImageAttachment (web)', () => {
	it('suspends, then shows an existing attachment', async () => {
		const document = makeDocument({
			attachments: { 'a-red.jpg': new Blob(['red'], { type: 'image/red' }) },
		});

		render(probeTree(document, 'a-red.jpg'));

		expect(screen.getByText('loading')).toBeTruthy();
		expect(await screen.findByText('blob:red')).toBeTruthy();
	});

	it('shows the fallback, not the previous image, while the next one loads', async () => {
		const fetches: Record<string, Deferred<ReturnType<typeof makeImageResponse>>> = {
			'b-red.jpg': defer(),
			'b-blue.jpg': defer(),
		};
		mockGet.mockImplementation((url: string) => fetches[url].promise);

		const document = makeDocument();
		const view = render(probeTree(document, 'b-red.jpg'));

		await act(async () => {
			fetches['b-red.jpg'].resolve(makeImageResponse('red'));
		});
		expect(await screen.findByText('blob:red')).toBeTruthy();

		// The row is reused for a different variation while blue is still loading.
		view.rerender(probeTree(document, 'b-blue.jpg'));

		// React keeps the suspended subtree in the DOM but hidden; the user
		// sees the fallback, not the previous image.
		expect(screen.getByText('blob:red')).not.toBeVisible();
		expect(screen.getByText('loading')).toBeVisible();

		await act(async () => {
			fetches['b-blue.jpg'].resolve(makeImageResponse('blue'));
		});
		expect(await screen.findByText('blob:blue')).toBeTruthy();
	});

	it('a stale slow load cannot overwrite the current image', async () => {
		// Red is not cached: it hangs on a slow network fetch.
		const redFetch = defer<ReturnType<typeof makeImageResponse>>();
		mockGet.mockImplementation(() => redFetch.promise);

		// Blue is already cached as an attachment and resolves immediately.
		const document = makeDocument({
			attachments: { 'c-blue.jpg': new Blob(['blue'], { type: 'image/blue' }) },
		});

		const view = render(probeTree(document, 'c-red.jpg'));
		view.rerender(probeTree(document, 'c-blue.jpg'));
		expect(await screen.findByText('blob:blue')).toBeTruthy();

		// Red's stale fetch finally resolves. It must not replace blue.
		await act(async () => {
			redFetch.resolve(makeImageResponse('red'));
		});
		expect(screen.getByText('blob:blue')).toBeTruthy();
	});

	it('fetches each URL once and serves later mounts from the cache', async () => {
		mockGet.mockImplementation(() => Promise.resolve(makeImageResponse('green')));
		const callsBefore = mockGet.mock.calls.length;

		const first = render(probeTree(makeDocument(), 'd-green.jpg'));
		expect(await screen.findByText('blob:green')).toBeTruthy();
		first.unmount();

		render(probeTree(makeDocument(), 'd-green.jpg'));
		expect(await screen.findByText('blob:green')).toBeTruthy();

		expect(mockGet.mock.calls.length - callsBefore).toBe(1);
	});

	it('returns a blank uri without suspending when there is no image', () => {
		render(probeTree(makeDocument(), ''));

		expect(screen.getByText('blank')).toBeTruthy();
		expect(screen.queryByText('loading')).toBeNull();
	});

	it('reports errors as state without a refetch loop, then retries after the delay', async () => {
		jest.useFakeTimers();
		let calls = 0;
		mockGet.mockImplementation(() =>
			++calls === 1
				? Promise.reject(new Error('network down'))
				: Promise.resolve(makeImageResponse('flaky'))
		);

		const first = render(probeTree(makeDocument(), 'e-flaky.jpg'));
		expect(await screen.findByText('error:network down')).toBeTruthy();

		// The errored resource stays cached: the Suspense retry and later
		// mounts read the error instead of refetching in a loop.
		first.unmount();
		const second = render(probeTree(makeDocument(), 'e-flaky.jpg'));
		expect(await screen.findByText('error:network down')).toBeTruthy();
		expect(calls).toBe(1);
		second.unmount();

		// After the retry delay the resource is evicted and a new mount refetches.
		await act(async () => {
			jest.advanceTimersByTime(ERROR_RETRY_DELAY_MS);
		});
		render(probeTree(makeDocument(), 'e-flaky.jpg'));
		expect(await screen.findByText('blob:flaky')).toBeTruthy();
		expect(calls).toBe(2);

		jest.useRealTimers();
	});
});
