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

describe('scrubBreadcrumb hardening', () => {
	it('replaces an Error argument with a scrubbed plain copy', () => {
		const error = new Error('email exists jane@example.com');
		const result = scrubBreadcrumb({
			message: 'x',
			data: { arguments: [error], logger: 'console' },
		});
		expect(result?.data.arguments[0]).not.toBeInstanceOf(Error);
		expect(result?.data.arguments[0]).toEqual(
			expect.objectContaining({ name: 'Error', message: 'email exists [EMAIL]' })
		);
		expect(JSON.stringify(result)).not.toContain('jane@example.com');
		expect(error.message).toBe('email exists jane@example.com');
	});

	it('survives a circular argument', () => {
		const loop: Record<string, unknown> = { email: 'jane@example.com' };
		loop.self = loop;
		const result = scrubBreadcrumb({ data: { arguments: [loop] } });
		expect(result?.data.arguments[0]).toEqual({ email: '[EMAIL]', self: '[Circular]' });
	});

	it('drops data nested past the depth limit', () => {
		let payload: Record<string, unknown> = { email: 'jane@example.com' };
		for (let i = 0; i < 20; i++) payload = { next: payload };
		const result = scrubBreadcrumb({ data: { payload } });
		expect(JSON.stringify(result)).toContain('[Depth]');
		expect(JSON.stringify(result)).not.toContain('jane@example.com');
	});

	it.each([
		[
			'https://shop.example/wp-json/wcpos/v1/customers?search=%2B34+612+345+678&per_page=10',
			'/wp-json/wcpos/v1/customers?search=[PHONE]&per_page=10',
		],
		[
			'https://shop.example/wp-json/wcpos/v1/customers?per_page=10&search=j%C3%A4ne%40ex%C3%A4mple.de',
			'/wp-json/wcpos/v1/customers?per_page=10&search=[EMAIL]',
		],
		[
			'https://shop.example/wp-json/wcpos/v1/customers?search=612+345+678',
			'/wp-json/wcpos/v1/customers?search=[PHONE]',
		],
	])('masks the encoded query value in %s', (url, expected) => {
		expect(scrubBreadcrumb({ data: { url } })?.data.url).toBe(expected);
	});

	it('leaves unmatched query values encoded', () => {
		const url =
			'https://shop.example/wp-json/wcpos/v2/orders?after=2026-11-16T10%3A00%3A00&include=12%2C34';
		expect(scrubBreadcrumb({ data: { url } })?.data.url).toBe(
			'/wp-json/wcpos/v2/orders?after=2026-11-16T10%3A00%3A00&include=12%2C34'
		);
	});

	it('masks an encoded query value in message text', () => {
		const result = scrubBreadcrumb({
			message: 'GET https://shop.example/x?search=612+345+678 failed',
		});
		expect(result?.message).toBe('GET https://shop.example/x?search=[PHONE] failed');
	});
});

describe('scrub hooks never throw', () => {
	const email = 'jane@example.com';
	it('replaces a toJSON function in breadcrumb data', () => {
		const result = scrubBreadcrumb({
			category: 'console',
			data: { arguments: [{ toJSON: () => email }] },
		});
		expect(JSON.stringify(result)).not.toContain(email);
		expect(result?.data.arguments).toEqual([{ toJSON: '[Function]' }]);
	});

	it('replaces a toJSON function in event extra', () => {
		const result = scrubEvent({ extra: { x: { toJSON: () => email } } });
		expect(JSON.stringify(result)).not.toContain(email);
		expect(result.extra).toEqual({ x: { toJSON: '[Function]' } });
	});

	it.each([
		['an Error with a numeric name', () => Object.assign(new Error(email), { name: 42 })],
		[
			'an Error with a throwing stack getter',
			() =>
				Object.defineProperty(new Error(email), 'stack', {
					get() {
						throw new Error(email);
					},
				}),
		],
		[
			'an object with a throwing getter',
			() => ({
				email,
				get boom(): never {
					throw new Error(email);
				},
			}),
		],
		[
			'a revoked Proxy',
			() => {
				const { proxy, revoke } = Proxy.revocable({ email }, {});
				revoke();
				return proxy;
			},
		],
		['BigInt and Symbol values', () => ({ big: 10n, sym: Symbol(email) })],
	])('scrubs %s', (_name, makeValue) => {
		const value = makeValue();
		const breadcrumb = scrubBreadcrumb({ message: email, data: { value } });
		const event = scrubEvent({ message: email, extra: { value }, contexts: { value: { value } } });
		const replacer = (_key: string, v: unknown) =>
			typeof v === 'bigint' || typeof v === 'symbol' ? String(v) : v;
		expect(JSON.stringify([breadcrumb, event], replacer)).not.toContain(email);
		expect(event.message).toBe('[EMAIL]');
	});

	it('coerces a numeric Error name before scrubbing', () => {
		expect(
			scrubBreadcrumb({ data: { value: Object.assign(new Error(email), { name: 42 }) } })?.data
				.value
		).toEqual(expect.objectContaining({ name: '42', message: '[EMAIL]' }));
	});

	it('drops a breadcrumb whose data cannot be scrubbed', () => {
		const { proxy, revoke } = Proxy.revocable({ email }, {});
		revoke();
		expect(scrubBreadcrumb({ message: email, data: proxy })).toBeNull();
		expect(
			scrubEvent({ breadcrumbs: [{ message: email, data: proxy }, { message: 'kept' }] })
				.breadcrumbs
		).toEqual([{ message: 'kept' }]);
	});

	it('sends the event without its scrubbed sections when the scrub throws', () => {
		expect(
			scrubEvent({
				message: email,
				request: { url: 42 as unknown as string },
				tags: { area: 'pos' },
			})
		).toEqual({ tags: { area: 'pos' } });
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

describe('BUILD_COMMIT', () => {
	const loadBuildCommit = () => {
		let value: string | undefined;
		jest.isolateModules(() => {
			value = jest.requireActual<typeof import('./sentry-core')>('./sentry-core').BUILD_COMMIT;
		});
		return value;
	};
	afterEach(() => {
		delete process.env.EXPO_PUBLIC_BUILD_COMMIT;
	});

	it('falls back to unknown when the build did not stamp a commit', () => {
		delete process.env.EXPO_PUBLIC_BUILD_COMMIT;
		expect(loadBuildCommit()).toBe('unknown');
	});

	it('reads the commit app.config.ts stamped', () => {
		process.env.EXPO_PUBLIC_BUILD_COMMIT = 'abc123def456';
		expect(loadBuildCommit()).toBe('abc123def456');
	});
});
