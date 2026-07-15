import { isRouteTeardownError, waitForAuthEntry, waitForOAuthCallback } from '../e2e/fixtures';

describe('isRouteTeardownError', () => {
	it('recognizes Playwright route callbacks that fail because the page closed', () => {
		expect(
			isRouteTeardownError(
				new Error(
					'route.fetch: Target page, context or browser has been closed while running route callback.'
				)
			)
		).toBe(true);
	});

	it('does not hide unrelated route failures', () => {
		expect(isRouteTeardownError(new Error('route.fetch: connect ECONNREFUSED'))).toBe(false);
	});
});

describe('waitForAuthEntry', () => {
	it('retries when the deployment entry point is not visible', async () => {
		const waitFor = jest
			.fn()
			.mockRejectedValueOnce(new Error('not visible'))
			.mockResolvedValueOnce(undefined);
		const page = {
			goto: jest.fn().mockResolvedValue(undefined),
			getByTestId: jest.fn().mockReturnValue({ waitFor }),
			waitForTimeout: jest.fn().mockResolvedValue(undefined),
		};

		await waitForAuthEntry(page as never);

		expect(page.goto).toHaveBeenCalledTimes(2);
		expect(page.waitForTimeout).toHaveBeenCalledTimes(1);
	});
});

describe('waitForOAuthCallback', () => {
	it('reports the WordPress log permission failure instead of a callback timeout', async () => {
		const page = {
			waitForURL: jest.fn().mockReturnValue(new Promise(() => {})),
			waitForFunction: jest.fn().mockResolvedValue(undefined),
		};

		await expect(
			waitForOAuthCallback(page as never, 'https://preview.example.com')
		).rejects.toThrow('sudo chown -R www-data:www-data /var/www/html/wp-content/uploads/wc-logs');
	});
});
