import { describe, expect, it } from 'vitest';

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
		expect(view.html).toContain('data-barcode-value="' + fixture.order.number + '"');
		expect(view.html).not.toContain('<barcode');
	});
});
