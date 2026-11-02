// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { DEFAULT_THERMAL_TEMPLATE } from '../default-thermal-template';
import { buildReceiptMarkupJob } from '../encode-receipt';
import { markAwaitingStore, markAwaitingStoreXml } from '../mark-awaiting-store';
import { renderPreview } from '../render-preview';
import { sampleReceiptData } from './fixtures';

const line = '<align mode="center"><bold><text>Awaiting store</text></bold></align>';

describe('markAwaitingStore', () => {
	it('prepends the bold centred line to the rendered body, escaped', () => {
		expect(markAwaitingStore('<h1>R</h1>', 'A & <b>')).toBe(
			'<p class="wcpos-awaiting-store" style="text-align:center;font-weight:700;margin:0 0 8px">A &amp; &lt;b&gt;</p><h1>R</h1>'
		);
	});
});

describe('markAwaitingStoreXml', () => {
	it('inserts the line as the first child of the receipt tag', () => {
		expect(
			markAwaitingStoreXml('<receipt paper-width="48"><text>R</text></receipt>', 'Awaiting store')
		).toBe(`<receipt paper-width="48">${line}<text>R</text></receipt>`);
	});

	it('skips a leading comment that names the receipt tag', () => {
		expect(
			markAwaitingStoreXml(
				'<!-- a <receipt> sample --><receipt><text>R</text></receipt>',
				'Awaiting store'
			)
		).toBe(`<!-- a <receipt> sample --><receipt>${line}<text>R</text></receipt>`);
	});

	it('prepends when there is no receipt tag', () => {
		expect(markAwaitingStoreXml('<text>R</text>', 'Awaiting store')).toBe(`${line}<text>R</text>`);
	});

	it('the default template renders it as its first line', () => {
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

// The ESC/POS fallback (`printReceipt`, the built-in layout) carries the line too.
it('the built-in layout prints the line first when the sale awaits the store', () => {
	const marked = buildReceiptMarkupJob(sampleReceiptData, { awaitingStoreLine: 'Awaiting store' });
	expect(marked.template).toBe(markAwaitingStoreXml(DEFAULT_THERMAL_TEMPLATE, 'Awaiting store'));
	expect(buildReceiptMarkupJob(sampleReceiptData).template).toBe(DEFAULT_THERMAL_TEMPLATE);
});
