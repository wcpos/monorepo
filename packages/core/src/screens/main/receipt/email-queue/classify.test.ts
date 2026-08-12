import { classifyEmailSendError } from './classify';

const axios = (over: Record<string, unknown>) =>
	Object.assign(new Error(String(over.message ?? 'boom')), { isAxiosError: true }, over);

describe('classifyEmailSendError', () => {
	it('queues when the device is known to be offline', () => {
		const failure = classifyEmailSendError(
			Object.assign(new Error('No internet connection'), {
				isPreFlightBlocked: true,
				blockCode: 'preflight-offline',
			})
		);
		expect(failure).toMatchObject({ kind: 'connectivity', code: 'preflight-offline' });
	});

	it('queues when requests are paused for recovery', () => {
		expect(
			classifyEmailSendError(
				Object.assign(new Error('System is recovering - please wait'), {
					isPreFlightBlocked: true,
					blockCode: 'preflight-recovering',
				})
			).kind
		).toBe('connectivity');
	});

	it('queues a transport failure with no response', () => {
		expect(classifyEmailSendError(axios({ code: 'ERR_NETWORK' })).kind).toBe('connectivity');
		expect(classifyEmailSendError(axios({ code: 'ECONNABORTED' })).kind).toBe('connectivity');
		expect(classifyEmailSendError(axios({ message: 'Network Error' })).kind).toBe('connectivity');
	});

	it('queues a bare fetch failure from the web platform', () => {
		expect(classifyEmailSendError(new TypeError('Failed to fetch')).kind).toBe('connectivity');
	});

	it('queues a cancelled request', () => {
		expect(
			classifyEmailSendError(Object.assign(new Error('canceled'), { name: 'CanceledError' })).kind
		).toBe('connectivity');
	});

	it('queues a 5xx and the "try later" 4xx statuses', () => {
		for (const status of [500, 502, 503, 504, 408, 429]) {
			expect(classifyEmailSendError(axios({ response: { status, data: {} } })).kind).toBe(
				'connectivity'
			);
		}
	});

	it('surfaces a plain 4xx immediately — it will never succeed', () => {
		const failure = classifyEmailSendError(
			axios({
				response: { status: 400, data: { message: 'Invalid email address.' } },
				wpMessage: 'Invalid email address.',
				wpServerCode: 'rest_invalid_param',
			})
		);
		expect(failure).toEqual({
			kind: 'permanent',
			reason: 'Invalid email address.',
			status: 400,
			code: 'rest_invalid_param',
			attempted: true,
		});
	});

	it('surfaces an auth block instead of queuing it — a queue cannot log the cashier in', () => {
		expect(
			classifyEmailSendError(
				Object.assign(new Error('Please log in to continue'), {
					isPreFlightBlocked: true,
					blockCode: 'preflight-auth-required',
				})
			).kind
		).toBe('permanent');
	});

	it('defaults to permanent for an error it does not recognise', () => {
		expect(classifyEmailSendError(new TypeError('x is not a function')).kind).toBe('permanent');
	});

	it('queues a 423 lock — a host holding a resource is not a verdict on the address', () => {
		expect(classifyEmailSendError(axios({ response: { status: 423, data: {} } })).kind).toBe(
			'connectivity'
		);
	});

	it('marks a pre-flight block as un-attempted, so it cannot spend the retry budget', () => {
		expect(
			classifyEmailSendError(
				Object.assign(new Error('App is in background'), {
					isPreFlightBlocked: true,
					blockCode: 'preflight-asleep',
				})
			)
		).toMatchObject({ kind: 'connectivity', attempted: false });
	});

	it('queues an axios error that carries a request but no response', () => {
		expect(classifyEmailSendError(axios({ request: {}, message: 'boom' }))).toMatchObject({
			kind: 'connectivity',
			attempted: true,
		});
	});

	it('surfaces an axios error that never made a request — a bad URL is not a bad connection', () => {
		expect(classifyEmailSendError(axios({ message: 'Invalid URL' })).kind).toBe('permanent');
	});
});
