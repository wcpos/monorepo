import { createElement } from 'react';

import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App, preparePrintDocument, printReceiptInHiddenFrame } from '../App';
import { countPreviewLines } from '../components/Stage';
import { createRandomReceipt } from '../randomizer';
import { fetchWpPreview, printRawTcp } from '../studio-api';
import {
	buildTemplateViewModel,
	bytesToBase64,
	bytesToDebugOutput,
	renderStudioTemplate,
	selectVisibleTemplate,
} from '../studio-core';
import { listBundledTemplates } from '../template-loader';

const originalFetch = globalThis.fetch;

const stableOverrides = {
	emptyCart: false,
	refund: false,
	rtl: false,
	multicurrency: false,
	multiPayment: false,
	fiscal: false,
	longNames: false,
	hasDiscounts: false,
	hasFees: false,
	hasShipping: false,
	cartSize: 2,
} as const;

function buildCanonicalFixture(seedId = 'studio-test-default') {
	const random = createRandomReceipt({ seed: seedId, overrides: { ...stableOverrides } });
	return { ...random.data, id: seedId };
}

afterEach(() => {
	globalThis.fetch = originalFetch;
	vi.useRealTimers();
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
		const fixture = buildCanonicalFixture();
		const view = renderStudioTemplate({
			template: {
				id: 'logicless-sample',
				name: 'Logicless sample',
				engine: 'logicless',
				source: 'bundled-gallery',
				content: '<h1>{{store.name}}</h1><p>{{meta.order_number}}</p>',
				previewHtml: '<h1>PHP diagnostic</h1>',
			},
			fixture,
			paperWidth: '80mm',
		});

		expect(view.kind).toBe('logicless');
		if (view.kind !== 'logicless') throw new Error('Expected logicless view');
		expect(view.html).toContain(fixture.store.name);
		expect(view.diagnosticHtml).toBe('<h1>PHP diagnostic</h1>');
	});

	it('renders thermal templates with preview HTML and ESC/POS hex/debug output', () => {
		const fixture = buildCanonicalFixture('studio-test-thermal');
		const view = renderStudioTemplate({
			template: {
				id: 'thermal-sample',
				name: 'Thermal sample',
				engine: 'thermal',
				source: 'bundled-gallery',
				content: '<receipt width="32"><text>{{store.name}}</text><line /></receipt>',
			},
			fixture,
			paperWidth: '58mm',
		});

		expect(view.kind).toBe('thermal');
		if (view.kind !== 'thermal') throw new Error('Expected thermal view');
		expect(view.html).toContain(fixture.store.name);
		expect(view.escposHex).toMatch(/1b 40/i);
		expect(view.escposBase64).toBe(bytesToBase64(new Uint8Array(Array.from(view.escposBytes))));
	});

	it('fetches real store preview data for a selected store URL and order', async () => {
		globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
			expect(String(input)).toBe(
				'/__studio/wp-preview?template_id=standard-receipt&store_url=https%3A%2F%2Fstore.test&order_id=1234'
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

	it('omits blank store URLs and trims order IDs for wp preview requests', async () => {
		globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
			expect(String(input)).toBe('/__studio/wp-preview?template_id=standard-receipt&order_id=1234');
			return Response.json({
				engine: 'thermal',
				template_content: '<receipt><text>{{order.number}}</text></receipt>',
				receipt_data: { order: { number: '1234' } },
				template_id: 'standard-receipt',
			});
		}) as typeof fetch;

		const preview = await fetchWpPreview({
			storeUrl: '   ',
			templateId: 'standard-receipt',
			orderId: ' 1234 ',
		});

		expect(preview.receiptData.id).toBe('store-standard-receipt-1234');
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

	it('prepares a print dialog shell without interpolating receipt HTML', () => {
		const printDocument = document.implementation.createHTMLDocument('');

		preparePrintDocument(printDocument, '80mm');

		expect(printDocument.title).toBe('WCPOS Template Studio Print');
		expect(printDocument.head.textContent).toContain('@page { size: 80mm auto; margin: 0; }');
		expect(printDocument.body.innerHTML).toBe('');
	});

	it('prints through an offscreen iframe without opening a popup window', async () => {
		vi.useFakeTimers();
		const openSpy = vi.spyOn(window, 'open');
		const receiptNode = document.createElement('section');
		receiptNode.className = 'paper-frame thermal-80';
		receiptNode.innerHTML = '<p>Receipt</p>';

		const createElement = document.createElement.bind(document);
		const printSpy = vi.fn();
		const focusSpy = vi.fn();
		vi.spyOn(document, 'createElement').mockImplementation(
			(tagName: string, options?: ElementCreationOptions) => {
				const element = createElement(tagName, options);
				if (tagName.toLowerCase() === 'iframe') {
					Object.defineProperty(element, 'contentWindow', {
						configurable: true,
						value: {
							document: document.implementation.createHTMLDocument(''),
							addEventListener: vi.fn(),
							focus: focusSpy,
							print: printSpy,
						},
					});
				}
				return element;
			}
		);

		await printReceiptInHiddenFrame({
			hostDocument: document,
			receiptNode,
			paperWidth: '80mm',
			cleanupDelayMs: 25,
		});

		const frame = document.querySelector<HTMLIFrameElement>('iframe.system-print-frame');
		expect(openSpy).not.toHaveBeenCalled();
		expect(frame).not.toBeNull();
		expect(frame?.style.position).toBe('fixed');
		expect(frame?.style.right).toBe('100vw');
		expect(frame?.style.bottom).toBe('100vh');
		expect(frame?.contentDocument?.body.textContent).toContain('Receipt');
		expect(focusSpy).toHaveBeenCalledOnce();
		expect(printSpy).toHaveBeenCalledOnce();

		vi.advanceTimersByTime(25);
		expect(document.querySelector('iframe.system-print-frame')).toBeNull();
		vi.useRealTimers();
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
							'<receipt><barcode type="code128">{{meta.order_number}}</barcode><qrcode>{{meta.order_number}}</qrcode></receipt>',
					},
				]);
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
		const fixture = buildCanonicalFixture('studio-test-snapshot');
		const model = buildTemplateViewModel({
			template: {
				id: 'logicless-sample',
				name: 'Logicless sample',
				engine: 'logicless',
				source: 'bundled-gallery',
				content: '<p>{{store.name}}</p>',
			},
			fixture,
			paperWidth: 'a4',
		});

		expect(model).toMatchObject({
			templateId: 'logicless-sample',
			fixtureId: 'studio-test-snapshot',
			engine: 'logicless',
			paperWidth: 'a4',
		});
		expect(model.html).toContain(fixture.store.name);
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

	it('counts preview lines with inert DOM parsing instead of tag-stripping', () => {
		const html = '<p>First</p>[<script>alert(1)</script><br><p>Second</p>';

		expect(countPreviewLines(html)).toBe(4);
	});

	it('counts repeated blank lines in previews', () => {
		const html = '<div>First<br><br>Second</div>';

		expect(countPreviewLines(html)).toBe(4);
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
