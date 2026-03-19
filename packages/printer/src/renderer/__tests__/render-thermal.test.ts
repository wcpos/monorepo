import { encodeThermalTemplate, renderThermalPreview } from '../index';
import { sampleReceiptData } from '../../encoder/__tests__/fixtures';
import { formatReceiptData } from '../../encoder/format-receipt-data';

const SIMPLE_TEMPLATE = `<receipt paper-width="48">
  <align mode="center">
    <bold>{{store.name}}</bold>
    <text>{{store.phone}}</text>
  </align>
  <line />
  {{#lines}}
  <row>
    <col width="36">{{name}}</col>
    <col width="12" align="right">{{line_total_incl}}</col>
  </row>
  {{/lines}}
  <line />
  <row>
    <col width="36"><bold>TOTAL</bold></col>
    <col width="12" align="right"><bold>{{totals.grand_total_incl}}</bold></col>
  </row>
  <cut />
</receipt>`;

describe('renderThermalPreview', () => {
	it('produces HTML string with store name', () => {
		const html = renderThermalPreview(SIMPLE_TEMPLATE, sampleReceiptData);
		expect(typeof html).toBe('string');
		expect(html).toContain('My Test Store');
	});

	it('renders line items via Mustache sections', () => {
		const html = renderThermalPreview(SIMPLE_TEMPLATE, sampleReceiptData);
		expect(html).toContain('Widget A');
		expect(html).toContain('Gadget B');
	});

	it('renders totals', () => {
		const html = renderThermalPreview(SIMPLE_TEMPLATE, sampleReceiptData);
		expect(html).toContain('TOTAL');
		expect(html).toContain('25');
	});

	it('accepts Record<string, any> data shape', () => {
		const html = renderThermalPreview(SIMPLE_TEMPLATE, sampleReceiptData as Record<string, any>);
		expect(html).toContain('My Test Store');
	});
});

describe('encodeThermalTemplate', () => {
	it('produces Uint8Array', () => {
		const bytes = encodeThermalTemplate(SIMPLE_TEMPLATE, sampleReceiptData);
		expect(bytes).toBeInstanceOf(Uint8Array);
		expect(bytes.length).toBeGreaterThan(0);
	});

	it('includes store name in encoded output', () => {
		const bytes = encodeThermalTemplate(SIMPLE_TEMPLATE, sampleReceiptData);
		const decoded = new TextDecoder().decode(bytes);
		expect(decoded).toContain('My Test Store');
	});

	it('includes line items', () => {
		const bytes = encodeThermalTemplate(SIMPLE_TEMPLATE, sampleReceiptData);
		const decoded = new TextDecoder().decode(bytes);
		expect(decoded).toContain('Widget A');
	});

	it('accepts encoder options', () => {
		const bytes = encodeThermalTemplate(SIMPLE_TEMPLATE, sampleReceiptData, {
			language: 'star-prnt',
			columns: 32,
		});
		expect(bytes).toBeInstanceOf(Uint8Array);
	});
});

describe('star-width columns integration', () => {
	const STAR_TEMPLATE = `<receipt paper-width="32">
  <align mode="center">
    <text><bold>{{store.name}}</bold></text>
  </align>
  <line />
  {{#lines}}
  <text>{{name}}</text>
  <row>
    <col width="6">x{{qty}}</col>
    <col width="*">@ {{unit_price_incl}}</col>
    <col width="10" align="right">{{line_total_incl}}</col>
  </row>
  {{/lines}}
  <line />
  <row>
    <col width="*">TOTAL</col>
    <col width="10" align="right">{{totals.grand_total_incl}}</col>
  </row>
</receipt>`;

	it('ESC/POS: star columns resolve at different printer widths', () => {
		const data = formatReceiptData(sampleReceiptData);

		const result32 = encodeThermalTemplate(STAR_TEMPLATE, data, { columns: 32 });
		const result48 = encodeThermalTemplate(STAR_TEMPLATE, data, { columns: 48 });

		const text32 = new TextDecoder().decode(result32);
		const text48 = new TextDecoder().decode(result48);

		// Both contain the data
		expect(text32).toContain('My Test Store');
		expect(text48).toContain('My Test Store');
		expect(text32).toContain('Widget A');
		expect(text48).toContain('Widget A');

		// Both contain formatted prices (not raw floats)
		expect(text32).toContain('$25.00');
		expect(text48).toContain('$25.00');

		// Outputs differ because column widths differ
		expect(result32.length).not.toEqual(result48.length);
	});

	it('HTML: star columns render with flex: 1', () => {
		const data = formatReceiptData(sampleReceiptData);
		const html = renderThermalPreview(STAR_TEMPLATE, data);

		expect(html).toContain('My Test Store');
		expect(html).toContain('$25.00');
		expect(html).toContain('flex: 1');
		expect(html).toContain('flex: 0 0 10ch');
	});
});
