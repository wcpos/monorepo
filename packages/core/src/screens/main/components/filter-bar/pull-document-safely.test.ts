import { pullDocumentSafely } from './pull-document-safely';

describe('pullDocumentSafely', () => {
	it('does not rethrow pullDocument failures from fire-and-forget callers', async () => {
		const pullDocument = jest.fn(async () => {
			throw new Error('network failed');
		});
		const collection = { name: 'customers' };

		await expect(pullDocumentSafely(pullDocument, 7, collection as any)).resolves.toBeUndefined();
		expect(pullDocument).toHaveBeenCalledWith(7, collection);
	});
});
