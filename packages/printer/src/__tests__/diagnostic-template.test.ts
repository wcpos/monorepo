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

	it('keeps printerName and date as Mustache placeholders', () => {
		const template = buildDiagnosticTemplate(48);
		expect(template).toContain('{{printerName}}');
		expect(template).toContain('{{date}}');
	});
});
