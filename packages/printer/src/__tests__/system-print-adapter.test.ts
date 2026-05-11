import { describe, expect, it } from 'vitest';

import { waitForPrintDocumentImages } from '../transport/system-print-adapter.web';

describe('waitForPrintDocumentImages', () => {
	it('resolves immediately when all images are already complete', async () => {
		const documentLike = {
			images: [{ complete: true }, { complete: true }],
		} as unknown as Document;

		await expect(waitForPrintDocumentImages(documentLike)).resolves.toBeUndefined();
	});
});
