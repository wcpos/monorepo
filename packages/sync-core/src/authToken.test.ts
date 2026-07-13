import { describe, expect, it } from 'vitest';

import { attachAuthToken, chooseAuthTransport, createAuthTokenStore } from './authToken';

describe('createAuthTokenStore', () => {
	it('defaults to no token', () => {
		const store = createAuthTokenStore();
		expect(store.get()).toBeNull();
	});

	it('holds an initial token', () => {
		const store = createAuthTokenStore('tok-initial');
		expect(store.get()).toBe('tok-initial');
	});

	it('updates on set and drops on clear (the seam a refresh writes through)', () => {
		const store = createAuthTokenStore('old');
		store.set('new');
		expect(store.get()).toBe('new');
		store.clear();
		expect(store.get()).toBeNull();
	});
});

describe('chooseAuthTransport', () => {
	// gap-analysis §4.2: some hosts strip the Authorization header, so the client
	// probes (/auth/test) and falls back to the `?authorization=` query param.
	it('prefers the header when it survives, else falls back to the query param', () => {
		expect(chooseAuthTransport(true)).toBe('header');
		expect(chooseAuthTransport(false)).toBe('query');
	});
});

describe('attachAuthToken', () => {
	it('sets an Authorization: Bearer header in header mode', () => {
		const out = attachAuthToken({ url: 'https://shop.example/wp-json/x' }, 'tok', 'header');
		expect(out).toEqual({
			url: 'https://shop.example/wp-json/x',
			headers: { Authorization: 'Bearer tok' },
		});
	});

	it('preserves existing headers and never mutates the input in header mode', () => {
		const input = { url: 'https://shop.example/x', headers: { Accept: 'application/json' } };
		const out = attachAuthToken(input, 'tok', 'header');
		expect(out.headers).toEqual({ Accept: 'application/json', Authorization: 'Bearer tok' });
		// input untouched
		expect(input.headers).toEqual({ Accept: 'application/json' });
	});

	it('appends ?authorization=Bearer <token> when the url has no query, and leaves headers alone in query mode', () => {
		const out = attachAuthToken({ url: 'https://shop.example/wp-json/x' }, 'tok', 'query');
		// The param carries the SAME Bearer value as the header — the server parses it with sscanf('Bearer %s').
		expect(out.url).toBe('https://shop.example/wp-json/x?authorization=Bearer%20tok');
		expect(out.headers).toEqual({});
	});

	it('appends &authorization= when the url already has a query string', () => {
		const out = attachAuthToken({ url: 'https://shop.example/x?limit=50&page=2' }, 'tok', 'query');
		expect(out.url).toBe('https://shop.example/x?limit=50&page=2&authorization=Bearer%20tok');
	});

	it('URL-encodes the Bearer value in query mode (JWTs carry . and can carry +/=)', () => {
		const token = 'a.b+c/d=';
		const out = attachAuthToken({ url: 'https://shop.example/x' }, token, 'query');
		expect(out.url).toBe(
			`https://shop.example/x?authorization=${encodeURIComponent(`Bearer ${token}`)}`
		);
		// round-trips back to the full "Bearer <token>" value the server extracts from
		const value = new URL(out.url).searchParams.get('authorization');
		expect(value).toBe(`Bearer ${token}`);
	});

	it('keeps the query param before a URL fragment', () => {
		const out = attachAuthToken({ url: 'https://shop.example/x?a=1#frag' }, 'tok', 'query');
		expect(out.url).toBe('https://shop.example/x?a=1&authorization=Bearer%20tok#frag');
	});

	// Retry-safety: attaching must be idempotent and single-source the token — a
	// stale case-variant `authorization` header would otherwise be merged by fetch
	// into `Bearer old, Bearer new`, and a stale query param would duplicate.
	it('replaces a prior case-variant Authorization header instead of doubling it (header mode)', () => {
		const out = attachAuthToken(
			{
				url: 'https://shop.example/x',
				headers: { authorization: 'Bearer stale', Accept: 'application/json' },
			},
			'fresh',
			'header'
		);
		expect(out.headers).toEqual({ Accept: 'application/json', Authorization: 'Bearer fresh' });
		// no lingering lowercase key
		expect(Object.keys(out.headers).filter((k) => k.toLowerCase() === 'authorization')).toEqual([
			'Authorization',
		]);
	});

	it('is idempotent in header mode (re-attaching yields the same single header)', () => {
		const once = attachAuthToken({ url: 'https://shop.example/x' }, 'tok', 'header');
		const twice = attachAuthToken(once, 'tok', 'header');
		expect(twice).toEqual(once);
	});

	it('replaces a prior authorization query param instead of duplicating it (query mode, idempotent)', () => {
		const once = attachAuthToken({ url: 'https://shop.example/x?limit=50' }, 'tok', 'query');
		const twice = attachAuthToken(once, 'tok', 'query');
		expect(twice.url).toBe('https://shop.example/x?limit=50&authorization=Bearer%20tok');
		expect(twice).toEqual(once);
	});

	it('drops a stale token from the unused channel when switching transport', () => {
		// header → query: the stale Authorization header must not ride along with the param
		const toQuery = attachAuthToken(
			{ url: 'https://shop.example/x', headers: { Authorization: 'Bearer stale' } },
			'tok',
			'query'
		);
		expect(toQuery.headers).toEqual({});
		expect(toQuery.url).toBe('https://shop.example/x?authorization=Bearer%20tok');

		// query → header: the stale ?authorization= param must not ride along with the header
		const toHeader = attachAuthToken(
			{ url: 'https://shop.example/x?authorization=Bearer%20stale' },
			'tok',
			'header'
		);
		expect(toHeader.url).toBe('https://shop.example/x');
		expect(toHeader.headers).toEqual({ Authorization: 'Bearer tok' });
	});
});
