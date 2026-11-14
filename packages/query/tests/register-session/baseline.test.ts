import { outsideBaseline } from '../../src/register-session/baseline';

const BASELINE = '2026-01-01T00:00:00';
const range = (from: number, to: number) =>
	Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe('outsideBaseline', () => {
	it('reads the record payload at most once per call, however many server order ids', () => {
		let reads = 0;
		const record = {
			remoteId: 7,
			get payload() {
				reads += 1;
				return { id: 7, date_created_gmt: '2025-12-31T00:00:00' };
			},
		};

		expect(outsideBaseline(record, BASELINE, range(1, 100))).toBe(false);
		expect(reads).toBeLessThanOrEqual(1);

		reads = 0;
		expect(outsideBaseline(record, BASELINE, range(101, 200))).toBe(true);
		expect(reads).toBeLessThanOrEqual(1);
	});

	it('gives the same result for an array and a Set of the same ids', () => {
		const withId = { remoteId: 7, payload: { id: 7 } };
		const withoutId = { remoteId: 7, payload: {} };
		const cases: [typeof withId | typeof withoutId, number[]][] = [
			[withId, [1, 7, 9]],
			[withId, [1, 9]],
			[withId, []],
			[withoutId, [1, 7, 9]],
			[withoutId, []],
		];
		const expected = [false, true, true, true, true];

		cases.forEach(([record, ids], i) => {
			expect(outsideBaseline(record, BASELINE, ids)).toBe(expected[i]);
			expect(outsideBaseline(record, BASELINE, new Set(ids))).toBe(expected[i]);
		});
	});

	describe.each([null, undefined])('with orderIds %p', (orderIds) => {
		it('counts an order the server has not seen', () => {
			expect(outsideBaseline({ remoteId: null, payload: { id: 7 } }, BASELINE, orderIds)).toBe(
				true
			);
		});

		it.each([
			['with Z', '2026-01-01T00:00:01Z', true],
			['without Z', '2026-01-01T00:00:01', true],
			['earlier, with Z', '2025-12-31T23:59:59Z', false],
			['earlier, without Z', '2025-12-31T23:59:59', false],
			['missing', undefined, false],
		])('compares date_created_gmt %s against the baseline', (_label, date, outside) => {
			const record = { remoteId: 7, payload: { id: 7, date_created_gmt: date } };
			expect(outsideBaseline(record, BASELINE, orderIds)).toBe(outside);
		});
	});
});
