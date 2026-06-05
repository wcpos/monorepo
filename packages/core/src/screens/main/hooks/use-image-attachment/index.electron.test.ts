/* eslint-disable import/first */

jest.mock('react', () => ({
	useMemo: <T>(factory: () => T): T => factory(),
}));

jest.mock('rxdb', () => ({
	isRxDocument: () => true,
}));

import { useImageAttachment } from './index.electron';

type DocumentArg = Parameters<typeof useImageAttachment>[0];

function decodeImageCacheUrl(uri: string): string {
	const parsed = new URL(uri);
	expect(parsed.protocol).toBe('wcpos-image:');
	expect(parsed.host).toBe('cache');

	return Buffer.from(parsed.pathname.replace(/^\//, ''), 'base64url').toString('utf-8');
}

describe('useImageAttachment (electron)', () => {
	it('creates a cache URL for image URLs containing non-Latin1 characters', () => {
		const imageUrl = 'https://example.test/wp-content/uploads/Swiss Crochet – édition.jpg';
		let result: ReturnType<typeof useImageAttachment> | undefined;

		expect(() => {
			result = useImageAttachment({} as DocumentArg, imageUrl);
		}).not.toThrow();

		expect(result?.uri).toMatch(/^wcpos-image:\/\/cache\//);
		expect(decodeImageCacheUrl(result?.uri ?? '')).toBe(imageUrl);
	});
});
