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
	autoPrint: false,
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
	autoPrint: false,
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

	it('returns null when escpos template matches thermal printer', () => {
		expect(detectMismatch(thermal, thermalPrinter)).toBeNull();
	});

	it('returns null when html template matches system printer', () => {
		expect(detectMismatch(html, systemPrinter)).toBeNull();
	});

	it('returns null when no printer is selected (system dialog fallback)', () => {
		expect(detectMismatch(thermal, null)).toBeNull();
	});

	it('detects escpos template sent to system printer', () => {
		const result = detectMismatch(thermal, systemPrinter);
		expect(result).toBeTruthy();
		expect(typeof result).toBe('string');
	});

	it('detects html template sent to thermal printer', () => {
		const result = detectMismatch(html, thermalPrinter);
		expect(result).toBeTruthy();
		expect(typeof result).toBe('string');
	});
});
