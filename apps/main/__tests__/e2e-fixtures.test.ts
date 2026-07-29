import {
	blockScriptRequests,
	isRouteTeardownError,
	waitForAuthEntry,
	waitForOAuthCallback,
} from '../e2e/fixtures';

// Reset at module scope to avoid jest-expo's winter-runtime "require outside test scope" error.
jest.resetModules();

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

	it('recognizes Playwright responses disposed during route teardown', () => {
		expect(isRouteTeardownError(new Error('apiResponse.json: Response has been disposed'))).toBe(
			true
		);
	});

	it('recognizes Playwright route callbacks that outlive their test', () => {
		expect(isRouteTeardownError(new Error('route.fetch: Test ended.'))).toBe(true);
	});

	it('does not hide unrelated route failures', () => {
		expect(isRouteTeardownError(new Error('route.fetch: connect ECONNREFUSED'))).toBe(false);
	});
});

describe('blockScriptRequests', () => {
	it('ignores route teardown while aborting an in-flight script request', async () => {
		const route = {
			request: jest.fn().mockReturnValue({ resourceType: () => 'script' }),
			abort: jest.fn().mockRejectedValue(new Error('route.abort: Test ended.')),
		};

		await expect(blockScriptRequests(route as never)).resolves.toBeUndefined();
	});

	it('does not hide unrelated failures while blocking scripts', async () => {
		const error = new Error('route.abort: access denied');
		const route = {
			request: jest.fn().mockReturnValue({ resourceType: () => 'script' }),
			abort: jest.fn().mockRejectedValue(error),
		};

		await expect(blockScriptRequests(route as never)).rejects.toBe(error);
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
		).rejects.toThrow('WordPress cannot write to wp-content/uploads/wc-logs');
	});
});
