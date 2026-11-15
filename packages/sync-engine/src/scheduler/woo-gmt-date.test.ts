import { describe, expect, it } from 'vitest';

import { wooGmtDate } from './woo-gmt-date';

function wordpressReadsGmt(sent: string, siteOffsetMinutes: number): string {
	// Models date_create($s, wp_timezone())->setTimezone(wp_timezone())->format('Y-m-d H:i:s').
	if (/(Z|[+-]\d{2}:\d{2})$/.test(sent)) {
		return new Date(Date.parse(sent) + siteOffsetMinutes * 60_000)
			.toISOString()
			.slice(0, 19)
			.replace('T', ' ');
	}
	return sent.replace('T', ' ');
}

describe('wooGmtDate', () => {
	it.each([
		{
			offset: 60,
			startSeconds: Date.UTC(2026, 10, 8, 23) / 1000,
			endSeconds: Date.UTC(2026, 10, 15, 22, 59, 59) / 1000,
			start: '2026-11-08T23:00:00',
			end: '2026-11-15T22:59:59',
		},
		{
			offset: 0,
			startSeconds: Date.UTC(2026, 10, 9) / 1000,
			endSeconds: Date.UTC(2026, 10, 15, 23, 59, 59) / 1000,
			start: '2026-11-09T00:00:00',
			end: '2026-11-15T23:59:59',
		},
		{
			offset: -300,
			startSeconds: Date.UTC(2026, 10, 9, 5) / 1000,
			endSeconds: Date.UTC(2026, 10, 16, 4, 59, 59) / 1000,
			start: '2026-11-09T05:00:00',
			end: '2026-11-16T04:59:59',
		},
		{
			offset: 330,
			startSeconds: Date.UTC(2026, 10, 8, 18, 30) / 1000,
			endSeconds: Date.UTC(2026, 10, 15, 18, 29, 59) / 1000,
			start: '2026-11-08T18:30:00',
			end: '2026-11-15T18:29:59',
		},
	])(
		'preserves the GMT window at site offset $offset minutes',
		({ offset, startSeconds, endSeconds, start, end }) => {
			expect(wooGmtDate(startSeconds)).toBe(start);
			expect(wooGmtDate(endSeconds)).toBe(end);
			expect(wordpressReadsGmt(wooGmtDate(startSeconds), offset)).toBe(start.replace('T', ' '));
			expect(wordpressReadsGmt(wooGmtDate(endSeconds), offset)).toBe(end.replace('T', ' '));
		}
	);

	it('omits milliseconds and a zone suffix', () => {
		expect(wooGmtDate(1_783_000_000)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
	});
});
