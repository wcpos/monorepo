import { createElement } from 'react';

import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App, buildPrintDocument } from '../App';
import { fetchWpPreview, printRawTcp } from '../studio-api';
import {
	buildTemplateViewModel,
	bytesToBase64,
	bytesToDebugOutput,
	renderStudioTemplate,
	selectVisibleTemplate,
} from '../studio-core';
import { listBundledTemplates } from '../template-loader';
import galleryFixture from '../../fixtures/gallery-default-receipt.json';

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
	vi.restoreAllMocks();
});

describe('template studio rendering harness', () => {
	it('lists only bundled/gallery templates and excludes database templates', async () => {
		const templates = await listBundledTemplates({
			templatesDir: new URL(`file://${process.cwd()}/src/test/fixtures/templates/`),
		});

		expect(templates.map((template) => template.id)).toEqual([
			'logicless-sample',
			'thermal-sample',
		]);
		expect(templates.every((template) => template.source === 'bundled-gallery')).toBe(true);
	});

	it('renders logicless templates with JS output and optional PHP diagnostic output', () => {
		const view = renderStudioTemplate({
			template: {
				id: 'logicless-sample',
				name: 'Logicless sample',
				engine: 'logicless',
				source: 'bundled-gallery',
				content: '<h1>{{store.name}}</h1><p>{{order.number}}</p>',
				previewHtml: '<h1>PHP diagnostic</h1>',
			},
			fixture: galleryFixture,
			paperWidth: '80mm',
		});

		expect(view.kind).toBe('logicless');
		if (view.kind !== 'logicless') throw new Error('Expected logicless view');
		expect(view.html).toContain('WCPOS Demo Store');
		expect(view.diagnosticHtml).toBe('<h1>PHP diagnostic</h1>');
	});

	it('renders thermal templates with preview HTML and ESC/POS hex/debug output', () => {
		const view = renderStudioTemplate({
			template: {
				id: 'thermal-sample',
				name: 'Thermal sample',
				engine: 'thermal',
				source: 'bundled-gallery',
				content: '<receipt width="32"><text>{{store.name}}</text><line /></receipt>',
			},
			fixture: galleryFixture,
			paperWidth: '58mm',
		});

		expect(view.kind).toBe('thermal');
		if (view.kind !== 'thermal') throw new Error('Expected thermal view');
		expect(view.html).toContain('WCPOS Demo Store');
		expect(view.escposHex).toMatch(/1b 40/i);
		expect(view.escposAscii).toContain('WCPOS Demo Store');
		expect(view.escposBase64).toBe(bytesToBase64(new Uint8Array(Array.from(view.escposBytes))));
	});

	it('fetches real store preview data for a selected store URL and order', async () => {
		globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
			expect(String(input)).toBe(
				'/__studio/wp-preview?store_url=https%3A%2F%2Fstore.test&template_id=standard-receipt&order_id=1234'
			);
			return Response.json({
				engine: 'thermal',
				template_content: '<receipt><text>{{order.number}}</text></receipt>',
				receipt_data: { order: { number: '1234' } },
				template_id: 'standard-receipt',
			});
		}) as typeof fetch;

		const preview = await fetchWpPreview({
			storeUrl: 'https://store.test',
			templateId: 'standard-receipt',
			orderId: '1234',
		});

		expect(preview).toMatchObject({
			id: 'standard-receipt',
			engine: 'thermal',
			source: 'wp-env',
			receiptData: { id: 'store-standard-receipt-1234', order: { number: '1234' } },
		});
	});

	it('posts ESC/POS bytes to the raw TCP print endpoint', async () => {
		globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			expect(String(input)).toBe('/__studio/print/raw-tcp');
			expect(init?.method).toBe('POST');
			expect(init?.headers).toMatchObject({
				'X-WCPOS-Template-Studio': '1',
			});
			expect(JSON.parse(String(init?.body))).toEqual({
				host: '127.0.0.1',
				port: 9100,
				data: 'G0BB',
			});
			return Response.json({ ok: true, bytesWritten: 3 });
		}) as typeof fetch;

		await expect(printRawTcp({ host: '127.0.0.1', port: 9100, data: 'G0BB' })).resolves.toEqual({
			ok: true,
			bytesWritten: 3,
		});
	});

	it('builds a print dialog document with the rendered receipt HTML', () => {
		const documentHtml = buildPrintDocument('<main><p>Receipt</p></main>', '80mm');

		expect(documentHtml).toContain('<title>WCPOS Template Studio Print</title>');
		expect(documentHtml).toContain('@page { size: 80mm auto; margin: 0; }');
		expect(documentHtml).toContain('<main><p>Receipt</p></main>');
	});

	it('keeps generated barcode SVGs visible in the React preview frame', async () => {
		globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url === '/__studio/templates') {
				return Response.json([
					{
						id: 'thermal-barcode-template',
						name: 'Thermal barcode template',
						engine: 'thermal',
						source: 'bundled-gallery',
						content:
							'<receipt><barcode type="code128">{{order.number}}</barcode><qrcode>{{order.number}}</qrcode></receipt>',
					},
				]);
			}
			if (url === '/__studio/fixtures') {
				return Response.json([galleryFixture]);
			}
			return new Response(null, { status: 404 });
		}) as typeof fetch;

		const { container } = render(createElement(App));

		await waitFor(() => {
			const preview = container.querySelector('.paper-frame')?.innerHTML ?? '';
			expect(preview).toContain('<svg');
			expect(preview).toContain('data-barcode-kind="barcode"');
			expect(preview).toContain('data-barcode-kind="qrcode"');
			expect(preview).toContain('stroke=');
		});
	});

	it('creates stable snapshot view models without overbuilding drift reports', () => {
		const model = buildTemplateViewModel({
			template: {
				id: 'logicless-sample',
				name: 'Logicless sample',
				engine: 'logicless',
				source: 'bundled-gallery',
				content: '<p>{{order.number}}</p>',
			},
			fixture: galleryFixture,
			paperWidth: 'a4',
		});

		expect(model).toMatchObject({
			templateId: 'logicless-sample',
			fixtureId: 'gallery-default-receipt',
			engine: 'logicless',
			paperWidth: 'a4',
		});
		expect(model.html).toContain('1001');
	});

	it('selects from the filtered template list instead of a hidden previous selection', () => {
		const logicless = {
			id: 'logicless-sample',
			name: 'Logicless sample',
			engine: 'logicless' as const,
			source: 'bundled-gallery' as const,
			content: '<p>logicless</p>',
		};
		const thermal = {
			id: 'thermal-sample',
			name: 'Thermal sample',
			engine: 'thermal' as const,
			source: 'bundled-gallery' as const,
			content: '<receipt />',
		};

		expect(selectVisibleTemplate([thermal], logicless.id)).toBe(thermal);
	});

	it('formats ESC/POS bytes as hex plus printable ASCII', () => {
		expect(bytesToDebugOutput(new Uint8Array([0x1b, 0x40, 0x41, 0x0a]))).toEqual({
			hex: '1b 40 41 0a',
			ascii: '.@A.',
		});
	});

	it('sanitizes preview and diagnostic HTML before DOM insertion', async () => {
		globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url === '/__studio/templates') {
				return Response.json([
					{
						id: 'unsafe-template',
						name: 'Unsafe template',
						engine: 'logicless',
						source: 'bundled-gallery',
						content:
							'<img src="x" onerror="window.__previewXss = true"><script>window.__scriptXss = true</script><p>Safe preview</p>',
						previewHtml:
							'<img src="x" onerror="window.__diagnosticXss = true"><script>window.__diagnosticScriptXss = true</script><p>Safe diagnostic</p>',
					},
				]);
			}
			if (url === '/__studio/fixtures') {
				return Response.json([galleryFixture]);
			}
			return new Response(null, { status: 404 });
		}) as typeof fetch;

		const { container } = render(createElement(App));

		await waitFor(() => {
			expect(container.querySelector('.paper-frame')?.innerHTML).toContain('Safe preview');
			expect(container.querySelector('.diagnostic-frame')?.innerHTML).toContain('Safe diagnostic');
		});

		expect(container.querySelector('.paper-frame script')).toBeNull();
		expect(container.querySelector('.paper-frame [onerror]')).toBeNull();
		expect(container.querySelector('.diagnostic-frame script')).toBeNull();
		expect(container.querySelector('.diagnostic-frame [onerror]')).toBeNull();
	});
});
