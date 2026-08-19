import {
	CATALOGUE_READY_TIMEOUT_MS,
	catalogueUnavailableMessage,
	DIAGNOSTIC_READ_TIMEOUT_MS,
	LOADED_COUNT_READY,
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

	it('rejects an empty grid that the footer sentence would have hidden', () => {
		// The whole point: `data-table-count` renders "Showing 0 of 27", so a bare
		// /[1-9]/ matches the SERVER total and passes with zero rows on screen —
		// exactly the regression this check exists to catch (#1336 review, #1337).
		expect('Showing 0 of 27').toMatch(/[1-9]/);
		expect(LOADED_COUNT_READY.test('0')).toBe(false);
		expect(LOADED_COUNT_READY.test('Showing 0 of 27')).toBe(false);
	});

	it('accepts a positive local count', () => {
		expect(LOADED_COUNT_READY.test('1')).toBe(true);
		expect(LOADED_COUNT_READY.test('27')).toBe(true);
		expect(LOADED_COUNT_READY.test(' 27 ')).toBe(true);
	});

	it('keeps the diagnostic read short enough to never eat the test budget', () => {
		// textContent() auto-waits for attachment; .catch() only handles the
		// eventual rejection, so an unbounded read on a never-mounting element
		// consumes the rest of the test timeout.
		expect(DIAGNOSTIC_READ_TIMEOUT_MS).toBeLessThanOrEqual(2_000);
	});

	it('names the signal, what it showed, and both plausible causes', () => {
		const message = catalogueUnavailableMessage({ countText: '0', elapsedMs: 20_001 });
		expect(message).toContain('data-table-loaded-count showed "0"');
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
