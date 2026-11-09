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

test('the default list matches the Pro contract default', () => {
	expect(DEFAULT_ICE_SERVERS).toEqual([
		{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] },
	]);
});
