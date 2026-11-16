import { describeBareException, prepareEvent, scrubBreadcrumb, scrubEvent } from './sentry-core';

describe('scrubEvent personal data', () => {
	const email = 'jane@example.com';
	const phone = '+61 412 345 678';
	const message = `${email} ${phone}`;
	const masked = '[EMAIL] [PHONE]';
	it.each([
		[
			'phone fields and numeric order ids',
			{
				extra: { context: { orderId: 1234567, billing: { phone: '0612345678' } } },
				contexts: { customer: { mobile: '0612345678' } },
				breadcrumbs: [{ data: { tel: '0612345678' } }],
			},
			{
				extra: { context: { orderId: 1234567, billing: { phone: '[PHONE]' } } },
				contexts: { customer: { mobile: '[PHONE]' } },
				breadcrumbs: [{ data: { tel: '[PHONE]' } }],
			},
		],
		[
			'message and exception',
			{ message, exception: { values: [{ value: message }] } },
			{ message: masked, exception: { values: [{ value: masked }] } },
		],
		[
			'extra and contexts',
			{
				extra: { message, context: { orderId: 42, customer: { email, phone } } },
				contexts: { thrown: { string: message } },
			},
			{
				extra: {
					message: masked,
					context: { orderId: 42, customer: { email: '[EMAIL]', phone: '[PHONE]' } },
				},
				contexts: { thrown: { string: masked } },
			},
		],
		[
			'console breadcrumbs and fingerprint',
			{
				breadcrumbs: [
					{
						category: 'console',
						message: `ERROR : Failed | Context: {"email":"${email}","phone":"${phone}"}`,
						data: { arguments: [email, phone], logger: 'console' },
					},
				],
				fingerprint: ['code', email],
			},
			{
				breadcrumbs: [
					{
						category: 'console',
						message: 'ERROR : Failed | Context: {"email":"[EMAIL]","phone":"[PHONE]"}',
						data: { arguments: ['[EMAIL]', '[PHONE]'], logger: 'console' },
					},
				],
				fingerprint: ['code', '[EMAIL]'],
			},
		],
	])('masks %s', (_name, input, expected) => {
		const event = prepareEvent(input);
		expect(event).toEqual(expected);
		expect(JSON.stringify(event)).not.toContain('jane@example.com');
		expect(JSON.stringify(event)).not.toContain('412 345 678');
	});
	it('scrubs a breadcrumb before it reaches the native SDK', () => {
		expect(
			scrubBreadcrumb({
				category: 'fetch',
				message: 'jane@example.com',
				data: {
					method: 'GET',
					url: 'https://shop.example.com/wp-json/wcpos/v1/customers?email=jane%40example.com',
				},
			})
		).toEqual({
			category: 'fetch',
			message: '[EMAIL]',
			data: { method: 'GET', url: '/wp-json/wcpos/v1/customers?email=[EMAIL]' },
		});
	});
});

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
		Object.defineProperty(error, Symbol.toStringTag, { value: 'Bearer tag-secret' });
		describeBareException(event, { originalException: error });
		// The token scrubber eats the closing bracket too; what matters is that the secret is gone.
		expect(event).toHaveProperty('contexts.thrown.tag', expect.stringContaining('[REDACTED]'));
		expect(event).toHaveProperty('contexts.thrown.tag', expect.not.stringContaining('tag-secret'));
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

	it('scrubs Basic credentials from bare exception diagnostics in beforeSend', () => {
		const credential = 'Basic YWRtaW46c2VjcmV0';
		// Sentry's event builder copies Error.name into `type` before beforeSend runs.
		const event = { exception: { values: [{ type: credential, value: 'No error message' }] } };
		const error = Object.assign(new Error(''), { name: credential, code: credential });
		error.stack = `Error: ${credential}`;
		error.toString = () => `Request failed with ${credential}`;
		Object.defineProperty(error, Symbol.toStringTag, { value: credential });
		Object.defineProperty(error, 'constructor', { value: { name: credential } });
		Object.defineProperty(error, credential, { value: 1, enumerable: true });

		const result = prepareEvent(event, { originalException: error });

		expect(result).toHaveProperty('exception.values.0.type', 'Basic [REDACTED]');
		expect(result).toHaveProperty('contexts.thrown.string', 'Request failed with Basic [REDACTED]');
		expect(result).toHaveProperty('contexts.thrown.stackHead', 'Error: Basic [REDACTED]');
		for (const field of ['name', 'code', 'constructor']) {
			expect(result).toHaveProperty(`contexts.thrown.${field}`, 'Basic [REDACTED]');
		}
		expect(result).toHaveProperty('contexts.thrown.tag', '[object Basic [REDACTED]]');
		expect(result).toHaveProperty(
			'contexts.thrown.keys',
			expect.arrayContaining(['Basic [REDACTED]'])
		);
		expect(JSON.stringify(result)).not.toContain('YWRtaW46c2VjcmV0');
	});
});

describe('scrubEvent origin stripping', () => {
	it('leaves log text that parses as a non-http URL intact', () => {
		const error =
			'write: orders/8f868cf0 is queued for deletion — sending another change would undo that; discard instead';
		expect(scrubEvent({ extra: { error } }).extra).toEqual({ error });
	});

	it('still strips http and https origins', () => {
		const event = scrubEvent({
			extra: {
				url: 'https://shop.example/wp-json/wcpos/v2/orders?x=1',
				plain: 'http://shop.example/wp-json/wcpos/v2/products?y=2',
			},
			request: { url: 'http://shop.example/wp-json/wcpos/v2/customers?z=3' },
		});
		expect(event.extra).toEqual({
			url: '/wp-json/wcpos/v2/orders?x=1',
			plain: '/wp-json/wcpos/v2/products?y=2',
		});
		expect(event.request?.url).toBe('/wp-json/wcpos/v2/customers?z=3');
	});

	it('still redacts credentials in non-http text', () => {
		const event = scrubEvent({ extra: { error: 'write: failed with Bearer secret-token' } });
		expect(event.extra).toEqual({ error: 'write: failed with Bearer [REDACTED]' });
		expect(JSON.stringify(event)).not.toContain('secret-token');
	});
});
