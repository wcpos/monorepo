import { resetConfirmBody } from './root-error-copy';

// Reset at module scope to avoid jest-expo's winter-runtime "require outside test scope" error.
jest.resetModules();

describe('resetConfirmBody', () => {
	it('states the number of unsent changes and that they are lost for good', () => {
		const body = resetConfirmBody({ status: 'some', count: 3 });
		expect(body).toContain('3 changes');
		expect(body).toContain('never reached your server');
		expect(body).toContain('permanently lost');
	});

	it('reads naturally for a single change', () => {
		const body = resetConfirmBody({ status: 'some', count: 1 });
		expect(body).toContain('1 change ');
		expect(body).not.toContain('1 changes');
		expect(body).toContain('has never reached your server');
	});

	it('says the reset MAY destroy sales when the count is unknown', () => {
		// The fail-soft branch. It must not read like "nothing to lose": the crash
		// screen renders above every provider and often above a database that will
		// not open, which is exactly when a queued sale is most at risk.
		const body = resetConfirmBody({ status: 'unknown' });
		expect(body).toContain('may include');
		expect(body).toContain('completed sales');
		expect(body).not.toContain('Nothing is waiting to be sent');
	});

	it('reassures only when the queue is genuinely empty', () => {
		const body = resetConfirmBody({ status: 'none' });
		expect(body).toContain('Nothing is waiting to be sent');
		expect(body).not.toContain('permanently lost');
	});

	it('always says what the reset does, whatever the queue holds', () => {
		for (const unsent of [
			{ status: 'unknown' } as const,
			{ status: 'none' } as const,
			{ status: 'some', count: 2 } as const,
		]) {
			expect(resetConfirmBody(unsent)).toContain('deletes everything stored on this device');
		}
	});
});
