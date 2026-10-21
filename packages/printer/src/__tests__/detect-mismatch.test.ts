import type { PrinterProfile } from '../types';

interface TemplateInfo {
	id: string | number;
	output_type: string;
	paper_width: string | null;
}

const thermal: TemplateInfo = { id: '1', output_type: 'escpos', paper_width: '80mm' };
const html: TemplateInfo = { id: '2', output_type: 'html', paper_width: null };

const thermalPrinter: PrinterProfile = {
	id: 'p1',
	name: 'Thermal',
	connectionType: 'network',
	vendor: 'epson',
	port: 9100,
	language: 'esc-pos',
	columns: 48,
	fullReceiptRaster: false,
	autoCut: true,
	autoOpenDrawer: false,
	isDefault: true,
	isBuiltIn: false,
};

const systemPrinter: PrinterProfile = {
	id: 'p2',
	name: 'System',
	connectionType: 'system',
	vendor: 'generic',
	port: 0,
	language: 'esc-pos',
	columns: 48,
	fullReceiptRaster: false,
	autoCut: false,
	autoOpenDrawer: false,
	isDefault: false,
	isBuiltIn: true,
};

describe('detectMismatch', () => {
	let detectMismatch: typeof import('../detect-mismatch').detectMismatch;

	beforeAll(async () => {
		const mod = await import('../detect-mismatch');
		detectMismatch = mod.detectMismatch;
	});

	it('returns null for a thermal template on a 48-column winspool queue (raw bytes)', () => {
		expect(
			detectMismatch(thermal, {
				...thermalPrinter,
				connectionType: 'system',
				address: 'winspool:POS-80',
			})
		).toBeNull();
	});

	it('returns null when a thermal template goes to a raw receipt printer', () => {
		expect(detectMismatch(thermal, thermalPrinter)).toBeNull();
	});

	it('returns null when an HTML template goes to the print dialog profile', () => {
		expect(detectMismatch(html, systemPrinter)).toBeNull();
	});

	it('returns null when an HTML template has no printer (print dialog)', () => {
		expect(detectMismatch(html, null)).toBeNull();
	});

	it('flags a thermal template with no printer: the dialog prints its preview', () => {
		expect(detectMismatch(thermal, null)).toBe('thermal-template-prints-preview');
	});

	it('flags a thermal template on the print dialog profile: the dialog prints its preview', () => {
		expect(detectMismatch(thermal, systemPrinter)).toBe('thermal-template-prints-preview');
	});

	it('flags an HTML template on a raw printer: the built-in layout prints instead', () => {
		expect(detectMismatch(html, thermalPrinter)).toBe('html-template-prints-default-layout');
	});

	it('flags an HTML template on a winspool queue (raw bytes)', () => {
		expect(
			detectMismatch(html, {
				...thermalPrinter,
				connectionType: 'system',
				address: 'winspool:POS-80',
			})
		).toBe('html-template-prints-default-layout');
	});

	it.each(['epson-sdp', 'printnode', 'star-cloudprnt'] as const)(
		'returns null for any template on an order-based cloud printer (%s renders server-side)',
		(cloudProvider) => {
			const cloud: PrinterProfile = { ...thermalPrinter, connectionType: 'cloud', cloudProvider };
			expect(detectMismatch(thermal, cloud)).toBeNull();
			expect(detectMismatch(html, cloud)).toBeNull();
		}
	);
});
