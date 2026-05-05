import { describe, expect, it } from 'vitest';

import { sanitizeHtml } from '@wcpos/receipt-renderer';

import { renderStudioTemplate } from '../studio-core';
import { createRandomReceipt } from '../randomizer';

describe('logicless template + <barcode> renders SVG through the studio pipeline', () => {
	it('resolves <barcode> elements in logicless HTML to inline SVG via bwip-js', () => {
		const random = createRandomReceipt({
			seed: 'logicless-barcode',
			overrides: {
				emptyCart: false,
				refund: false,
				rtl: false,
				multicurrency: false,
				multiPayment: false,
				fiscal: false,
				longNames: false,
				hasDiscounts: false,
				hasFees: false,
				hasShipping: false,
				cartSize: 1,
			},
		});
		const fixture = { ...random.data, id: 'logicless-barcode' };

		const view = renderStudioTemplate({
			template: {
				id: 'logicless-barcode',
				name: 'Logicless barcode',
				engine: 'logicless',
				source: 'bundled-gallery',
				content: '<div><barcode type="code128">{{order.number}}</barcode></div>',
			},
			fixture,
			paperWidth: 'a4',
		});

		expect(view.kind).toBe('logicless');
		expect(view.html).toContain('<svg');
		expect(view.html).toContain('data-barcode-kind="barcode"');
		expect(view.html).toContain('data-barcode-value="' + fixture.meta.order_number + '"');
		expect(view.html).not.toContain('<barcode');
	});

	// Regression for #375 follow-up: App.tsx used to re-sanitize the rendered
	// logicless HTML with the default profile, which strips `<svg>` and broke
	// the barcode in both preview and print. This test pins down the
	// upstream cause: the default `sanitizeHtml` profile is SVG-stripping, so
	// we must NOT pipe `rendered.html` through it again.
	it('default sanitizeHtml strips <svg> — proving why App must not re-sanitize', () => {
		const html = '<div><svg viewBox="0 0 10 10"><path d="M0 0h10v10H0z"/></svg></div>';
		expect(sanitizeHtml(html)).not.toContain('<svg');
	});
});
