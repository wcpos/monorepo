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
