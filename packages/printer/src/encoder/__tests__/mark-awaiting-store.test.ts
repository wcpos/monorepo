// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { DEFAULT_THERMAL_TEMPLATE } from '../default-thermal-template';
import { markAwaitingStoreXml } from '../mark-awaiting-store';
import { renderPreview } from '../render-preview';
import { sampleReceiptData } from './fixtures';

const line = '<align mode="center"><bold><text>Awaiting store</text></bold></align>';

describe('markAwaitingStoreXml', () => {
	it('inserts the line right after the receipt tag with attributes', () => {
		expect(
			markAwaitingStoreXml('<receipt paper-width="48"><text>R</text></receipt>', 'Awaiting store')
		).toBe(`<receipt paper-width="48">${line}<text>R</text></receipt>`);
	});

	it('prepends the line when there is no receipt tag, and is idempotent', () => {
		const once = markAwaitingStoreXml('<text>R</text>', 'Awaiting store');
		expect(once).toBe(`${line}<text>R</text>`);
		expect(markAwaitingStoreXml(once, 'Awaiting store')).toBe(once);
	});

	it('escapes the text, and the default template renders it as its first line', () => {
		expect(markAwaitingStoreXml('', 'A & <b>')).toContain('<text>A &amp; &lt;b&gt;</text>');
		const { html } = renderPreview({
			template: markAwaitingStoreXml(
				DEFAULT_THERMAL_TEMPLATE,
				'Awaiting store · not yet confirmed'
			),
			engine: 'thermal',
			data: sampleReceiptData,
		});
		const marked = html.indexOf('Awaiting store · not yet confirmed');
		expect(marked).toBeGreaterThan(-1);
		expect(marked).toBeLessThan(html.indexOf('My Test Store'));
	});
});
