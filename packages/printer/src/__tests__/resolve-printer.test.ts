import type { PrinterProfile } from '../types';

interface TemplateInfo {
	id: string | number;
	output_type: string;
	paper_width: string | null;
}

const thermal80mm: TemplateInfo = {
	id: 'tmpl-1',
	output_type: 'escpos',
	paper_width: '80mm',
};
const thermal58mm: TemplateInfo = {
	id: 'tmpl-2',
	output_type: 'escpos',
	paper_width: '58mm',
};
const htmlTemplate: TemplateInfo = {
	id: 'tmpl-3',
	output_type: 'html',
	paper_width: null,
};

const epsonPrinter: PrinterProfile = {
	id: 'printer-1',
	name: 'Epson TM-T88',
	connectionType: 'network',
	vendor: 'epson',
	address: '192.168.1.100',
	port: 9100,
	language: 'esc-pos',
	columns: 48,
	fullReceiptRaster: false,
	autoCut: true,
	autoOpenDrawer: false,
	isDefault: true,
	isBuiltIn: false,
};

const starPrinter58: PrinterProfile = {
	id: 'printer-2',
	name: 'Star TSP100',
	connectionType: 'network',
	vendor: 'star',
	address: '192.168.1.101',
	port: 9100,
	language: 'star-prnt',
	columns: 32,
	fullReceiptRaster: false,
	autoCut: true,
	autoOpenDrawer: false,
	isDefault: false,
	isBuiltIn: false,
};

const systemPrinter: PrinterProfile = {
	id: 'printer-3',
	name: 'Office A4',
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

const allPrinters = [epsonPrinter, starPrinter58, systemPrinter];

describe('resolvePrinter', () => {
	let resolvePrinter: typeof import('../resolve-printer').resolvePrinter;

	beforeAll(async () => {
		const mod = await import('../resolve-printer');
		resolvePrinter = mod.resolvePrinter;
	});

	describe('Layer 1: print-time override', () => {
		it('returns the manually selected printer regardless of template type', () => {
			const result = resolvePrinter({
				template: htmlTemplate,
				overrides: new Map(),
				profiles: allPrinters,
				manualPrinterId: starPrinter58.id,
			});
			expect(result?.id).toBe('printer-2');
		});

		it('returns null if manual printer ID does not exist', () => {
			const result = resolvePrinter({
				template: htmlTemplate,
				overrides: new Map(),
				profiles: allPrinters,
				manualPrinterId: 'nonexistent',
			});
			expect(result).toBeNull();
		});
	});

	describe('Layer 2: settings override', () => {
		it('uses the override mapping when no manual selection', () => {
			const overrides = new Map([['tmpl-3', 'printer-2']]);
			const result = resolvePrinter({
				template: htmlTemplate,
				overrides,
				profiles: allPrinters,
			});
			expect(result?.id).toBe('printer-2');
		});

		it('ignores override if the referenced printer no longer exists', () => {
			const overrides = new Map([['tmpl-1', 'deleted-printer']]);
			const result = resolvePrinter({
				template: thermal80mm,
				overrides,
				profiles: allPrinters,
			});
			expect(result?.id).toBe('printer-1');
		});
	});

	describe('Layer 3: auto-match', () => {
		it('matches escpos/80mm to a 48-column non-system printer', () => {
			const result = resolvePrinter({
				template: thermal80mm,
				overrides: new Map(),
				profiles: allPrinters,
			});
			expect(result?.id).toBe('printer-1');
		});

		it('auto-matches 80mm ESC/POS templates to a standard 42-column thermal printer', () => {
			const result = resolvePrinter({
				template: {
					id: 'thermal-80',
					output_type: 'escpos',
					paper_width: '80mm',
				},
				overrides: new Map(),
				profiles: [
					{
						...epsonPrinter,
						id: 'standard-80mm',
						columns: 42,
						isDefault: true,
					},
				],
			});

			expect(result?.id).toBe('standard-80mm');
		});

		it('auto-matches 80mm ESC/POS templates to a 48-column thermal printer when available', () => {
			const result = resolvePrinter({
				template: {
					id: 'thermal-80',
					output_type: 'escpos',
					paper_width: '80mm',
				},
				overrides: new Map(),
				profiles: [{ ...epsonPrinter, id: 'wide-80mm', columns: 48, isDefault: true }],
			});

			expect(result?.id).toBe('wide-80mm');
		});

		it('matches escpos/58mm to a 32-column non-system printer', () => {
			const result = resolvePrinter({
				template: thermal58mm,
				overrides: new Map(),
				profiles: allPrinters,
			});
			expect(result?.id).toBe('printer-2');
		});

		it('matches html to a system printer', () => {
			const result = resolvePrinter({
				template: htmlTemplate,
				overrides: new Map(),
				profiles: allPrinters,
			});
			expect(result?.id).toBe('printer-3');
		});

		it('prefers isDefault when multiple printers match', () => {
			const secondEpson: PrinterProfile = {
				...epsonPrinter,
				id: 'printer-4',
				name: 'Epson Backup',
				isDefault: false,
			};
			const result = resolvePrinter({
				template: thermal80mm,
				overrides: new Map(),
				profiles: [secondEpson, epsonPrinter],
			});
			expect(result?.id).toBe('printer-1');
		});

		it('returns null when no printers are configured', () => {
			const result = resolvePrinter({
				template: thermal80mm,
				overrides: new Map(),
				profiles: [],
			});
			expect(result).toBeNull();
		});

		it('returns null when no match found (escpos template, only system printer)', () => {
			const result = resolvePrinter({
				template: thermal80mm,
				overrides: new Map(),
				profiles: [systemPrinter],
			});
			expect(result).toBeNull();
		});
	});

	describe('layer priority', () => {
		it('print-time override beats settings override', () => {
			const overrides = new Map([['tmpl-1', 'printer-3']]);
			const result = resolvePrinter({
				template: thermal80mm,
				overrides,
				profiles: allPrinters,
				manualPrinterId: 'printer-2',
			});
			expect(result?.id).toBe('printer-2');
		});

		it('settings override beats auto-match', () => {
			const overrides = new Map([['tmpl-1', 'printer-3']]);
			const result = resolvePrinter({
				template: thermal80mm,
				overrides,
				profiles: allPrinters,
			});
			expect(result?.id).toBe('printer-3');
		});
	});
});
