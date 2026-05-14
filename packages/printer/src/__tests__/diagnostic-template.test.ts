import { buildDiagnosticTemplate } from '../encoder/diagnostic-template';

describe('buildDiagnosticTemplate', () => {
	it('sets paper-width to the given column count', () => {
		expect(buildDiagnosticTemplate(42)).toContain('<receipt paper-width="42">');
		expect(buildDiagnosticTemplate(32)).toContain('<receipt paper-width="32">');
	});

	it('emits a column ruler exactly as wide as the column count', () => {
		const ruler = buildDiagnosticTemplate(32).match(/<text>(\d{8,})<\/text>/)?.[1];
		expect(ruler).toHaveLength(32);
	});

	it('clamps oversized column counts before building the ruler', () => {
		const template = buildDiagnosticTemplate(1000);
		const ruler = template.match(/<text>(\d{8,})<\/text>/)?.[1];

		expect(template).toContain('<receipt paper-width="96">');
		expect(ruler).toHaveLength(96);
	});

	it('falls back to the default width for malformed column counts', () => {
		expect(buildDiagnosticTemplate(Number.NaN)).toContain('<receipt paper-width="42">');
		expect(buildDiagnosticTemplate(0)).toContain('<receipt paper-width="42">');
	});

	it('keeps printerName and date as Mustache placeholders', () => {
		const template = buildDiagnosticTemplate(48);
		expect(template).toContain('{{printerName}}');
		expect(template).toContain('{{date}}');
	});
});
