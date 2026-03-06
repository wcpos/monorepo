import { renderThermalPreview, encodeThermalTemplate } from '../index';
import { sampleReceiptData } from '../../encoder/__tests__/fixtures';

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
