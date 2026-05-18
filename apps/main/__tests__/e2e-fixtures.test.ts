import { isRouteTeardownError } from '../e2e/fixtures';

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
