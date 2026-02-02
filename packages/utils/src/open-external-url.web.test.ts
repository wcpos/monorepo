/**
 * @jest-environment jsdom
 */
import { openExternalURL } from './open-external-url.web';

describe('openExternalURL (web)', () => {
	let windowOpenSpy: jest.SpyInstance;

	beforeEach(() => {
		windowOpenSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
	});

	afterEach(() => {
		windowOpenSpy.mockRestore();
	});

	it('should call window.open with the URL and _blank target', async () => {
		await openExternalURL('https://example.com');
		expect(windowOpenSpy).toHaveBeenCalledWith(
			'https://example.com',
			'_blank',
			'noopener,noreferrer'
		);
	});

	it('should handle errors without throwing', async () => {
		windowOpenSpy.mockImplementation(() => {
			throw new Error('blocked');
		});
		await expect(openExternalURL('https://example.com')).resolves.toBeUndefined();
	});

	it('should pass the exact URL string provided', async () => {
		await openExternalURL('https://example.com/path?query=1#hash');
		expect(windowOpenSpy).toHaveBeenCalledWith(
			'https://example.com/path?query=1#hash',
			'_blank',
			'noopener,noreferrer'
		);
	});
});
