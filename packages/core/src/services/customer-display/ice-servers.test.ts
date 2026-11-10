/** @jest-environment node */

import { DEFAULT_ICE_SERVERS, parseIceServers } from './ice-servers';

test('parseIceServers keeps a valid list and copies only known keys', () => {
	const input = [
		{ urls: 'stun:a.test:3478' },
		{ urls: ['turn:b.test'], username: 'u', credential: 'c', extra: 1 },
	];
	const result = parseIceServers(input);
	expect(result).toEqual([
		{ urls: 'stun:a.test:3478' },
		{ urls: ['turn:b.test'], username: 'u', credential: 'c' },
	]);
	expect(result).not.toBe(input);
	expect(result?.[0]).not.toBe(input[0]);
});

test('parseIceServers accepts an empty list as LAN-only', () => {
	expect(parseIceServers([])).toEqual([]);
});

test('parseIceServers rejects malformed input', () => {
	for (const input of [
		undefined,
		null,
		'stun:a',
		[{}],
		[{ urls: '' }],
		[{ urls: [] }],
		[{ urls: [1] }],
		[{ urls: 'stun:a', username: 2 }],
	]) {
		expect(parseIceServers(input)).toBeUndefined();
	}
});

test('rejects a list with a URL that is not a STUN or TURN URL', () => {
	expect(parseIceServers([{ urls: 'http://a.test' }])).toBeUndefined();
	expect(parseIceServers([{ urls: ['stun:a.test', 'not a url'] }])).toBeUndefined();
});

test('rejects a TURN server without both username and credential', () => {
	expect(parseIceServers([{ urls: 'turn:a.test:3478' }])).toBeUndefined();
	expect(parseIceServers([{ urls: 'turns:a.test', username: 'u' }])).toBeUndefined();
});

test('accepts a TURN server with credentials and uppercase schemes', () => {
	const input = [
		{ urls: ['TURN:a.test:3478'], username: 'u', credential: 'c' },
		{ urls: 'STUN:b.test' },
	];
	expect(parseIceServers(input)).toEqual(input);
});

test('the default list matches the Pro contract default', () => {
	expect(DEFAULT_ICE_SERVERS).toEqual([
		{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] },
	]);
});
