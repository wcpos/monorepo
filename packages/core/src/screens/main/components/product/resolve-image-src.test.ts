import { resolveImageSrc } from './resolve-image-src';

describe('resolveImageSrc', () => {
	it('reads the singular `image` a variation carries', () => {
		expect(resolveImageSrc({ image: { src: 'https://store.test/blue-300x300.jpg' } })).toBe(
			'https://store.test/blue-300x300.jpg'
		);
	});

	it('returns undefined when `image` carries no src', () => {
		expect(resolveImageSrc({})).toBeUndefined();
		expect(resolveImageSrc({ image: { src: '' } })).toBeUndefined();
		expect(resolveImageSrc(undefined)).toBeUndefined();
	});

	it('does not read the 1.10.0 `images` array', () => {
		const payload = { images: [{ src: 'https://store.test/array.jpg' }], image: null };
		expect(resolveImageSrc(payload)).toBeUndefined();
	});
});
