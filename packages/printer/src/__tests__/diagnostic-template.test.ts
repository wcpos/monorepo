import { DIAGNOSTIC_LOGO_DATA_URI, DIAGNOSTIC_LOGO_WIDTH_DOTS } from '../encoder/diagnostic-logo';
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

describe('buildDiagnosticTemplate capability sections', () => {
	const template = buildDiagnosticTemplate(42);

	it('embeds the logo as a data URI at the width it was rendered for', () => {
		// Fetching it would make a network or CORS failure look like a printer failure.
		expect(template).toContain(`<image src="${DIAGNOSTIC_LOGO_DATA_URI}"`);
		expect(template).toContain(`width="${DIAGNOSTIC_LOGO_WIDTH_DOTS}"`);
	});

	it('exercises a QR code and both barcode symbologies', () => {
		expect(template).toContain('<qrcode');
		expect(template).toContain('type="code128"');
		// Fixed-length and checksummed, so it fails to encode rather than printing wrong.
		expect(template).toContain('type="ean13"');
	});

	it('covers the text styles a printer can silently drop', () => {
		expect(template).toContain('<bold>');
		expect(template).toContain('<underline>');
		expect(template).toContain('<invert>');
		expect(template).toContain('<size');
	});

	it('prints accented and currency characters for the code page check', () => {
		// Entity-encoded in the source so the template survives any file encoding.
		expect(template).toContain('&#233;'); // e-acute
		expect(template).toContain('&#8364;'); // euro
	});

	it('labels every section, so a failure is reportable and a gap is legible', () => {
		// An <image> with no prepared asset prints nothing at all — without a label that is
		// indistinguishable from a page that simply has no logo.
		for (const label of [
			'1 COLUMN RULER',
			'2 LOGO (RASTER)',
			'3 QR CODE',
			'4 BARCODE CODE128',
			'5 BARCODE EAN-13',
			'6 TEXT STYLES',
			'7 ALIGNMENT',
			'8 CHARACTERS',
		]) {
			expect(template).toContain(label);
		}
	});
});
