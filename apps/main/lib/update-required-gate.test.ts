// New-file collection under the jest-expo winter runtime requires this at
// module scope (see lib/sync-log-observer.test.ts — same root cause).
import {
	clearUpdateRequired,
	currentUpdateRequired,
	reportUpdateRequired,
	subscribeUpdateRequired,
} from './update-required-gate';

jest.resetModules();

const DETAILS = { minProtocol: 2, serverProtocol: 2, pluginVersion: '1.11.0', status: 426 };

afterEach(() => {
	clearUpdateRequired('https://a.example.test');
	clearUpdateRequired('https://b.example.test');
});

describe('update-required gate', () => {
	it('reports, notifies subscribers, and clears', () => {
		const seen: unknown[] = [];
		const unsubscribe = subscribeUpdateRequired('https://a.example.test', (state) =>
			seen.push(state)
		);

		reportUpdateRequired('https://a.example.test', DETAILS);
		expect(currentUpdateRequired('https://a.example.test')).toEqual(DETAILS);

		clearUpdateRequired('https://a.example.test');
		expect(currentUpdateRequired('https://a.example.test')).toBeNull();
		expect(seen).toEqual([DETAILS, null]);
		unsubscribe();
	});

	it('keys by canonical site, so URL spelling differences reach one gate', () => {
		reportUpdateRequired('https://A.example.test/', DETAILS);
		expect(currentUpdateRequired('https://a.example.test')).toEqual(DETAILS);
		expect(currentUpdateRequired('http://a.example.test')).toEqual(DETAILS);
	});

	it("scopes state per site — one site's refusal never leaks to another", () => {
		reportUpdateRequired('https://a.example.test', DETAILS);
		expect(currentUpdateRequired('https://b.example.test')).toBeNull();
	});
});
