import { describeBareException, prepareEvent } from './sentry-core';

describe('describeBareException', () => {
	it('leaves an error with a message unchanged', () => {
		const event = { exception: { values: [{ value: 'Something failed' }] } };
		expect(describeBareException(event, { originalException: new Error('Something failed') })).toBe(
			event
		);
		expect(event).not.toHaveProperty('contexts');
	});

	it('leaves events without an original exception unchanged', () => {
		const event = { exception: { values: [{ value: 'No error message' }] } };
		expect(describeBareException(event, {})).toBe(event);
		expect(event).not.toHaveProperty('contexts');
	});

	it('describes an Error prototype without a message or stack', () => {
		const event = { exception: { values: [{ value: 'No error message' }] } };
		describeBareException(event, { originalException: Object.create(Error.prototype) });
		expect(event).toHaveProperty(
			'contexts.thrown',
			expect.objectContaining({
				tag: '[object Object]',
				constructor: 'Error',
				hasStack: false,
				keys: [],
			})
		);
	});

	it('keeps a stack from an Error with an empty message', () => {
		const event = { exception: { values: [{ value: '' }] } };
		describeBareException(event, { originalException: new Error('') });
		expect(event).toHaveProperty('contexts.thrown.hasStack', true);
		expect(event).toHaveProperty('contexts.thrown.stackHead', expect.stringMatching(/.+/));
	});

	it('keeps the other fields when string conversion throws', () => {
		const event = { exception: { values: [{ value: '' }] } };
		const originalException = {
			toString() {
				throw new Error('Cannot stringify');
			},
		};
		expect(describeBareException(event, { originalException })).toBe(event);
		expect(event).toHaveProperty('contexts.thrown.string', null);
		expect(event).toHaveProperty('contexts.thrown.typeof', 'object');
	});

	it('redacts tokens in code and keys and strips origins from the stack head', () => {
		const event = { exception: { values: [{ value: 'No error message' }] } };
		const error = Object.assign(new Error(''), { code: 'Bearer code-secret' });
		Object.defineProperty(error, 'Bearer key-secret', { value: 1, enumerable: true });
		error.stack = 'Error\n    at render (https://shop.example/wp-content/plugins/pos/app.js:1:2)';
		describeBareException(event, { originalException: error });
		expect(event).toHaveProperty('contexts.thrown.code', 'Bearer [REDACTED]');
		expect(event).toHaveProperty('contexts.thrown.keys', ['code', 'Bearer [REDACTED]']);
		expect(event).toHaveProperty(
			'contexts.thrown.stackHead',
			'Error\n    at render ({}/wp-content/plugins/pos/app.js:1:2)'
		);
	});

	it('prepares diagnostics and redacts exception values together', () => {
		const event = {
			exception: {
				values: [
					{ value: 'Request failed with Bearer secret-token' },
					{ value: 'No error message' },
				],
			},
		};
		const error = new Error('');
		error.stack = 'Error: Bearer stack-secret';
		error.toString = () => 'Bearer string-secret';
		expect(prepareEvent(event, { originalException: error })).toBe(event);
		expect(event).toHaveProperty('contexts.thrown.hasStack', true);
		expect(event).toHaveProperty('contexts.thrown.stackHead', 'Error: Bearer [REDACTED]');
		expect(event).toHaveProperty('contexts.thrown.string', 'Bearer [REDACTED]');
		expect(event.exception.values[0].value).toBe('Request failed with Bearer [REDACTED]');
	});
});
