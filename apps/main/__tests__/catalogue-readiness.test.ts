import {
	CATALOGUE_READY_TIMEOUT_MS,
	catalogueUnavailableMessage,
} from '../e2e/catalogue-readiness';

// jest-expo installs winter globals lazily; a new test file in this package
// must reset modules at module scope or the suite fails before it runs.
jest.resetModules();

describe('catalogue readiness', () => {
	it('bounds the restored-session wait well under the OAuth ceiling', () => {
		// The point of this wait is to NOTICE an unusable session quickly. If it
		// ever creeps back toward the 120s OAuth ceiling (or the old swallowed
		// 60s), every authenticated test silently pays it again.
		expect(CATALOGUE_READY_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
	});

	it('names the signal, what it showed, and both plausible causes', () => {
		const message = catalogueUnavailableMessage({ countText: '0', elapsedMs: 20_001 });
		expect(message).toContain('data-table-count showed "0"');
		expect(message).toContain('20001ms');
		// A CI reader with no other context must be pointed at both causes rather
		// than left to infer a regression from timings.
		expect(message).toMatch(/no products/i);
		expect(message).toMatch(/render/i);
	});

	it('distinguishes a missing count element from a zero count', () => {
		expect(catalogueUnavailableMessage({ countText: null, elapsedMs: 5 })).toContain(
			'never rendered'
		);
	});

	it('claims nothing about what the caller does next', () => {
		// The same text is thrown from the restored path (which does fall back to
		// OAuth) and from the OAuth path itself (which has nothing left to fall
		// back to), so any such claim would be false half the time — #1336 review.
		expect(catalogueUnavailableMessage({ countText: '0', elapsedMs: 1 })).not.toMatch(
			/falling back/i
		);
	});
});
