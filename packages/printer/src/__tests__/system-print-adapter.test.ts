import { describe, expect, it, vi } from 'vitest';

import { waitForPrintDocumentImages } from '../transport/system-print-adapter.web';

describe('waitForPrintDocumentImages', () => {
	it('resolves immediately when all images are already complete', async () => {
		const documentLike = {
			images: [{ complete: true }, { complete: true }],
		} as unknown as Document;

		await expect(waitForPrintDocumentImages(documentLike)).resolves.toBeUndefined();
	});
});

it('continues after a timeout when an image never loads or errors', async () => {
	vi.useFakeTimers();
	try {
		const image = {
			complete: false,
			addEventListener: vi.fn(),
		};
		const promise = waitForPrintDocumentImages({ images: [image] } as unknown as Document, 25);
		await vi.advanceTimersByTimeAsync(25);
		await expect(promise).resolves.toBeUndefined();
	} finally {
		vi.useRealTimers();
	}
});
