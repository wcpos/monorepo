import { describe, expect, it } from 'vitest';

import { readServerSentence, readWpFatalDetail } from './serverSentence';

describe('readServerSentence', () => {
	it('keeps a lone `<` as text and stays linear on a run of them', () => {
		const run = '<'.repeat(5_000);
		expect(
			readServerSentence({ code: 'x', message: `Stock <b>fell</b> below 3 ${run}` }, 500)
		).toBe(`Stock fell below 3 ${run}`);
	});

	it('stays linear on a long run of unclosed tag openers', () => {
		const run = '<a'.repeat(100_000);
		const started = Date.now();
		expect(readServerSentence({ code: 'x', message: `${run}>` }, 500)).toEqual(
			expect.stringContaining('<a<a<a')
		);
		expect(Date.now() - started).toBeLessThan(2_000);
	});

	it('keeps comparison operators as text — only tag syntax opens a tag', () => {
		expect(
			readServerSentence(
				{ code: 'x', message: 'Expected x < 5 and y > 2 in <b>wpdb</b> <!-- note -->' },
				500
			)
		).toBe('Expected x < 5 and y > 2 in wpdb');
		expect(
			readServerSentence({ code: 'x', message: 'Expected x<y and z>2 in <b>wpdb</b>' }, 500)
		).toBe('Expected x<y and z>2 in wpdb');
		expect(
			readServerSentence({ code: 'x', message: 'Expected x<a and z>2 in <b>wpdb</b>' }, 500)
		).toBe('Expected x<a and z>2 in wpdb');
	});

	it('keeps the location within the ledger’s 200-character cap: first line only, budgeted, host path dropped', () => {
		const detail = readWpFatalDetail({
			error: {
				message: `Uncaught Exception: ${'x'.repeat(300)}\nStack trace:\n#0 boom()`,
				file: '/home/u1/domains/shop.example/public_html/wp-content/plugins/acme/includes/class-acme-sync.php',
				line: 412,
			},
		});

		expect(detail).toMatch(
			/^Uncaught Exception: x+… in wp-content\/plugins\/acme\/includes\/class-acme-sync\.php:412$/
		);
		expect(detail!.length).toBeLessThanOrEqual(200);
		expect(detail).not.toContain('Stack trace');
		expect(
			readWpFatalDetail({ error: { message: 'Boom', file: '/opt/app/boot.php', line: 3 } })
		).toBe('Boom in boot.php:3');
	});

	it('drops a long plugin path to its file name so the line number still fits under the cap', () => {
		const detail = readWpFatalDetail({
			error: {
				message: `Uncaught Exception: ${'x'.repeat(300)}`,
				file: `/home/u1/public_html/wp-content/plugins/${'very-long-vendor-segment/'.repeat(8)}class-acme-sync.php`,
				line: 412,
			},
		});

		expect(detail).toMatch(/^Uncaught Exception: x+… in class-acme-sync\.php:412$/);
		expect(detail!.length).toBeLessThanOrEqual(200);
	});

	it('reads a Windows host path and bounds an absurd file name, keeping the line number', () => {
		const read = (file: string) =>
			readWpFatalDetail({ error: { message: 'Boom', file, line: 7 } })!;

		expect(read('C:\\inetpub\\wwwroot\\wp-includes\\class-wpdb.php')).toBe(
			'Boom in wp-includes/class-wpdb.php:7'
		);
		expect(read('C:\\inetpub\\wwwroot\\boot.php')).toBe('Boom in boot.php:7');
		const silly = read(`/srv/${'f'.repeat(400)}.php`);
		expect(silly).toMatch(/^Boom in …f+\.php:7$/);
		expect(silly.length).toBeLessThanOrEqual(200);
	});

	it('reads the detail without a file as the bare message, and ignores an empty one', () => {
		expect(readWpFatalDetail({ error: { message: 'Out of memory' } })).toBe('Out of memory');
		expect(
			readWpFatalDetail({ error: { message: '   ', file: 'x.php', line: 1 } })
		).toBeUndefined();
		expect(readWpFatalDetail({ error: 'a string, as some plugins send' })).toBeUndefined();
		expect(readWpFatalDetail(null)).toBeUndefined();
	});
});
