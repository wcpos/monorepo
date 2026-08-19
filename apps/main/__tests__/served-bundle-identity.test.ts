import { compareBundleIdentity, entryFromHtml } from '../e2e/served-bundle-identity';

// jest-expo installs winter globals lazily; a new test file in this package
// must reset modules at module scope or the suite fails before it runs.
jest.resetModules();

const ENTRY_A = '/_expo/static/js/web/entry-aaaa1111bbbb2222cccc3333dddd4444.js';
const ENTRY_B = '/_expo/static/js/web/entry-99998888777766665555444433332222.js';

describe('served bundle identity', () => {
	it('extracts the Expo entry bundle from served html', () => {
		expect(
			entryFromHtml(`<html><body><script src="${ENTRY_A}" defer></script></body></html>`)
		).toBe(ENTRY_A);
		expect(entryFromHtml('<html><body>no bundle here</body></html>')).toBeNull();
	});

	it('accepts a served bundle that matches the local build', () => {
		expect(compareBundleIdentity(ENTRY_A, ENTRY_A, 'http://localhost:8091')).toEqual({
			ok: true,
			entry: ENTRY_A,
		});
	});

	it('rejects another worktree answering the port, naming the port-collision cause', () => {
		const verdict = compareBundleIdentity(ENTRY_A, ENTRY_B, 'http://localhost:8092');
		expect(verdict.ok).toBe(false);
		if (verdict.ok !== false) throw new Error('expected a rejection');
		// The whole point of the check: the message must send the reader to the
		// listening process, not to the app under test.
		expect(verdict.reason).toContain(ENTRY_B);
		expect(verdict.reason).toContain('holds that port');
	});

	it('rejects a URL serving no bundle at all', () => {
		const verdict = compareBundleIdentity(ENTRY_A, null, 'http://localhost:8092');
		expect(verdict.ok).toBe(false);
	});

	it('reports unchecked (never a false pass) when there is no local build to compare', () => {
		const verdict = compareBundleIdentity(null, ENTRY_B, 'https://deployed.example.test');
		expect(verdict.ok).toBe('unchecked');
	});
});
