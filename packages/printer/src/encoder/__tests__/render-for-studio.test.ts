import { describe, expect, it } from 'vitest';

import { formatReceiptData } from '../format-receipt-data';
import { mapReceiptData } from '../map-receipt-data';
import { buildTemplateData, renderForStudio } from '../render-for-studio';
import { sampleReceiptData } from './fixtures';

const LOGICLESS_TEMPLATE = `
<div class="receipt">
  <h1>{{store.name}}</h1>
  <p>Order #{{order.number}}</p>
  <ul>
    {{#lines}}
      <li>{{name}} — {{line_total_display}}</li>
    {{/lines}}
  </ul>
  <p>Total: {{totals.total_display}}</p>
</div>
`;

const THERMAL_TEMPLATE = `<receipt><text>{{store.name}}</text><text>{{totals.total_display}}</text></receipt>`;

describe('renderForStudio', () => {
	it('renders a logicless template through the canonical pipeline', () => {
		const result = renderForStudio({
			template: LOGICLESS_TEMPLATE,
			engine: 'logicless',
			data: sampleReceiptData,
		});

		expect(result.engine).toBe('logicless');
		expect(result.html).toContain('My Test Store');
		expect(result.html).toContain('Order #1042');
		// Display values are produced by formatReceiptData
		expect(result.data.totals.total_display).toBeDefined();
	});

	it('renders a thermal template and returns ESC/POS bytes', () => {
		const result = renderForStudio({
			template: THERMAL_TEMPLATE,
			engine: 'thermal',
			data: sampleReceiptData,
		});

		expect(result.engine).toBe('thermal');
		if (result.engine !== 'thermal') return;
		expect(result.html).toContain('My Test Store');
		expect(result.bytes).toBeInstanceOf(Uint8Array);
		expect(result.bytes.length).toBeGreaterThan(0);
	});

	it('produces the same template data as map → format applied directly', () => {
		const direct = formatReceiptData(
			mapReceiptData(sampleReceiptData as unknown as Record<string, unknown>)
		);
		const helper = buildTemplateData(sampleReceiptData);
		expect(helper).toEqual(direct);
	});

	it('normalizes pre-canonical input (mapReceiptData runs first)', () => {
		const minimal = {
			order_number: '1',
			currency: 'USD',
			store: { name: 'X' },
			lines: [],
		};
		// Should not throw — mapReceiptData fills defaults
		const result = renderForStudio({
			template: LOGICLESS_TEMPLATE,
			engine: 'logicless',
			data: minimal,
		});
		expect(result.html).toContain('X');
	});

	it('respects the sanitize option', () => {
		const dangerous = `<div>{{store.name}}<script>alert(1)</script></div>`;
		const sanitized = renderForStudio({
			template: dangerous,
			engine: 'logicless',
			data: sampleReceiptData,
			sanitize: true,
		});
		expect(sanitized.html).not.toContain('<script>');

		const raw = renderForStudio({
			template: dangerous,
			engine: 'logicless',
			data: sampleReceiptData,
			sanitize: false,
		});
		expect(raw.html).toContain('<script>');
	});
});
