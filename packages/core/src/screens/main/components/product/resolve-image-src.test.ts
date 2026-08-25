import { resolveImageSrc } from './resolve-image-src';

describe('resolveImageSrc', () => {
	it('reads the v2 wire shape — variations hydrated through the products controller carry `images`', () => {
		expect(resolveImageSrc({ images: [{ src: 'https://store.test/red-300x300.jpg' }] })).toBe(
			'https://store.test/red-300x300.jpg'
		);
	});

	it('reads the v1 wire shape — the wc/v3 variations controller carries a singular `image`', () => {
		expect(resolveImageSrc({ image: { src: 'https://store.test/blue-300x300.jpg' } })).toBe(
			'https://store.test/blue-300x300.jpg'
		);
	});

	it('prefers `images` when a payload somehow carries both', () => {
		expect(
			resolveImageSrc({
				images: [{ src: 'https://store.test/array.jpg' }],
				image: { src: 'https://store.test/object.jpg' },
			})
		).toBe('https://store.test/array.jpg');
	});

	it('falls back to `image` when `images` is present but empty — an emptied gallery is not a URL', () => {
		expect(resolveImageSrc({ images: [], image: { src: 'https://store.test/only.jpg' } })).toBe(
			'https://store.test/only.jpg'
		);
	});

	it('returns undefined when neither shape carries a src', () => {
		expect(resolveImageSrc({})).toBeUndefined();
		expect(resolveImageSrc({ images: [{}], image: null })).toBeUndefined();
		expect(resolveImageSrc({ image: { src: '' } })).toBeUndefined();
		expect(resolveImageSrc(undefined)).toBeUndefined();
	});
});
