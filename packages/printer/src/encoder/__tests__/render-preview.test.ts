// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { renderPreview } from '../render-preview';
import { sampleReceiptData } from './fixtures';

/**
 * Regression test for the POS receipt preview dropping the tax breakdown.
 *
 * Gallery templates guard the per-rate tax table behind `{{#has_tax_summary}}`
 * and pick the heading via `{{#tax.display_incl}}`/`{{#tax.display_excl}}`.
 * The server provides both fields, but mapReceiptData used to rebuild the
 * canonical object without them, so client-rendered previews (and prints)
 * silently lost the tax table that server-rendered PDFs showed.
 */
const TAX_BLOCK_TEMPLATE = `
<div>
	{{#has_tax_summary}}
	<div class="heading">{{#tax.display_incl}}{{i18n.included_tax}}{{/tax.display_incl}}{{#tax.display_excl}}{{i18n.tax_summary}}{{/tax.display_excl}}</div>
	<table>
		{{#tax_summary}}
		<tr><td>{{label}}</td><td>{{taxable_amount_excl_display}}</td><td>{{tax_amount_display}}</td><td>{{taxable_amount_incl_display}}</td></tr>
		{{/tax_summary}}
	</table>
	{{/has_tax_summary}}
	<span class="tax-label">{{#tax.display_incl}}{{i18n.included_tax}}{{/tax.display_incl}}{{#tax.display_excl}}{{i18n.total_tax}}{{/tax.display_excl}}</span>
</div>
`;

describe('renderPreview tax breakdown', () => {
	it('renders the tax table and tax labels from canonical (server) receipt data', () => {
		const result = renderPreview({
			template: TAX_BLOCK_TEMPLATE,
			engine: 'logicless',
			data: sampleReceiptData,
		});

		// sampleReceiptData carries one tax_summary row (label "Tax", 2.27)
		// and displays prices tax-inclusive.
		expect(result.html).toContain('<td>Tax</td>');
		expect(result.html).toContain('$2.27');
		expect(result.html).toContain('Tax included');
	});

	it('renders nothing inside the guard when there are no tax rows', () => {
		const data = structuredClone(sampleReceiptData);
		data.tax_summary = [];

		const result = renderPreview({
			template: TAX_BLOCK_TEMPLATE,
			engine: 'logicless',
			data,
		});

		expect(result.html).not.toContain('<table>');
		// The totals tax-row label outside the guard still renders.
		expect(result.html).toContain('Tax included');
	});
});
