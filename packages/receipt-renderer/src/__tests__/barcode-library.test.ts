import { beforeEach, describe, expect, it } from 'vitest';

import { resetBarcodeLibraryForTests } from '../barcode-library';
import { getBarcodeLibrary, loadBarcodeLibrary, renderThermalPreview } from '../index';
import { renderBarcode } from '../render-html';

const template = '<receipt><barcode type="code128">ABC</barcode></receipt>';

describe('barcode library', () => {
	beforeEach(() => resetBarcodeLibraryForTests());

	it('renders a marked placeholder before the library loads', () => {
		expect(getBarcodeLibrary()).toBeNull();
		const html = renderThermalPreview(template, {});

		expect(html).toContain('data-barcode-pending="true"');
		expect(html).not.toContain('<svg');
	});

	it('renders SVG synchronously after the library loads', async () => {
		await loadBarcodeLibrary();
		const html = renderThermalPreview(template, {});

		expect(html).toContain('<svg');
		expect(html).not.toContain('data-barcode-pending');
	});

	it('shares the in-flight load and returns the same library object', async () => {
		const first = loadBarcodeLibrary();
		const second = loadBarcodeLibrary();

		expect(second).toBe(first);
		expect(await second).toBe(await first);
		expect(await loadBarcodeLibrary()).toBe(await first);
		expect(getBarcodeLibrary()).toBe(await first);
	});

	it('renders a hostile barcode kind as a code-chosen constant', async () => {
		const hostileKind = 'qrcode"><img src=x onerror=alert(1)>' as never;
		const pending = renderBarcode('code128', 'ABC', 40, hostileKind);

		expect(pending).toContain('data-barcode-pending="true"');
		expect(pending).not.toContain('<img');
		expect(pending).not.toContain('onerror');
		expect(pending).toContain('data-barcode-kind="barcode"');

		await loadBarcodeLibrary();
		const svg = renderBarcode('code128', 'ABC', 40, hostileKind);

		expect(svg).toContain('<svg');
		expect(svg).not.toContain('<img');
		expect(svg).not.toContain('onerror');
		expect(svg).toContain('data-barcode-kind="barcode"');
	});
});
