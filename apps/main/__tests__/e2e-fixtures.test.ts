import { isRouteTeardownError } from '../e2e/route-errors';

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

	it('recognizes Playwright route callbacks that outlive the test', () => {
		expect(
			isRouteTeardownError(
				new Error(
					"route.fetch: Test ended. Consider awaiting `await page.unrouteAll({ behavior: 'ignoreErrors' })` before the end of the test to ignore remaining routes in flight."
				)
			)
		).toBe(true);
		expect(isRouteTeardownError(new Error('apiResponse.json: Response has been disposed'))).toBe(
			true
		);
		expect(
			isRouteTeardownError(
				new Error(
					'browserContext.close: Protocol error (Target.disposeBrowserContext): Failed to find context with id 513C879CBD62230DCD877196EE9BEC01'
				)
			)
		).toBe(true);
	});

	it('does not hide unrelated route failures', () => {
		expect(isRouteTeardownError(new Error('route.fetch: connect ECONNREFUSED'))).toBe(false);
	});
});
