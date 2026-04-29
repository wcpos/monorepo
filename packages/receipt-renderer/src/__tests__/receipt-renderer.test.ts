import { describe, expect, it } from 'vitest';

import {
	encodeThermalTemplate,
	parseXml,
	renderEscpos,
	renderHtml,
	renderLogiclessTemplate,
	renderThermalPreview,
	sanitizeHtml,
} from '../index';

const THERMAL_TEMPLATE = `<receipt paper-width="32">
  <align mode="center"><bold>{{store.name}}</bold></align>
  <line />
  {{#lines}}
  <row><col width="*">{{name}}</col><col width="10" align="right">{{total}}</col></row>
  {{/lines}}
  <cut />
</receipt>`;

const data = {
	store: { name: 'My Test Store' },
	lines: [
		{ name: 'Widget A', total: '$10.00' },
		{ name: 'Gadget B', total: '$15.00' },
	],
};

describe('@wcpos/receipt-renderer exports', () => {
	it('renders sanitized logicless HTML with Mustache data', () => {
		const html = renderLogiclessTemplate(
			'<main><h1>{{store.name}}</h1><img src="x" onerror="alert(1)"><script>alert(1)</script></main>',
			data
		);

		expect(html).toContain('<h1>My Test Store</h1>');
		expect(html).not.toContain('<script');
		expect(html).not.toContain('onerror');
	});

	it('sanitizes javascript URLs and event handlers from arbitrary HTML', () => {
		const html = sanitizeHtml('<a href="javascript:alert(1)" onclick="alert(2)">Pay</a>');

		expect(html).toContain('Pay');
		expect(html).not.toContain('javascript:');
		expect(html).not.toContain('onclick');
	});

	it('sanitizes obfuscated unsafe URL protocols in DOMParser fallback mode', () => {
		const originalWindow = globalThis.window;
		const originalDocument = globalThis.document;
		const originalDOMParser = globalThis.DOMParser;
		if (!originalDOMParser) {
			throw new Error('DOMParser is required for this test');
		}

		try {
			Reflect.deleteProperty(globalThis, 'window');
			Reflect.deleteProperty(globalThis, 'document');
			globalThis.DOMParser = originalDOMParser;

			const html = sanitizeHtml(
				'<form action="java\nscript:alert(1)"><button formaction="vbscript:msgbox(1)">Pay</button><img src="data:image/png;base64,abcd" /></form>'
			);

			expect(html).toContain('<form><button>Pay</button><img></form>');
			expect(html).not.toContain('action=');
			expect(html).not.toContain('formaction=');
			expect(html).not.toContain('data:');
		} finally {
			globalThis.window = originalWindow;
			globalThis.document = originalDocument;
			globalThis.DOMParser = originalDOMParser;
		}
	});

	it('parses thermal XML and renders HTML previews', () => {
		const ast = parseXml('<receipt paper-width="32"><text>Hello</text></receipt>');
		const html = renderHtml(ast);

		expect(ast.paperWidth).toBe(32);
		expect(html).toContain('width: 32ch');
		expect(html).toContain('<div>Hello</div>');
	});

	it('falls back to defaults when numeric XML attributes are invalid', () => {
		const ast = parseXml(
			'<receipt paper-width="12px"><feed lines="3.5" /><qrcode size="1e3">code</qrcode></receipt>'
		);
		const html = renderHtml(ast);

		expect(ast.paperWidth).toBe(48);
		expect(html).toContain('width: 48ch');
		expect(html).toContain('height: 1.4em');
		expect(html).toContain('width: 100px; height: 100px');
	});

	it('renders thermal templates through Mustache, XML AST, and sanitized HTML', () => {
		const html = renderThermalPreview(THERMAL_TEMPLATE, data);

		expect(html).toContain('My Test Store');
		expect(html).toContain('Widget A');
		expect(html).toContain('$15.00');
		expect(html).toContain('✂');
	});

	it('rejects unsafe image data URIs in HTML rendering', () => {
		const ast = parseXml(
			'<receipt><image src="data:image/svg+xml,&lt;svg onload=alert(1)&gt;" width="200" /></receipt>'
		);
		const html = renderHtml(ast);

		expect(html).not.toContain('<img');
	});

	it('sanitizes style-affecting numeric fields when rendering HTML', () => {
		const ast = {
			type: 'receipt',
			paperWidth: Number.NaN,
			children: [
				{
					type: 'align',
					mode: 'left; background:url(https://evil.test)',
					children: [
						{
							type: 'size',
							width: Number.NaN,
							height: 1,
							children: [{ type: 'raw-text', value: 'X' }],
						},
					],
				},
				{
					type: 'image',
					src: 'https://example.com/logo.png',
					width: Number.NaN,
				},
				{
					type: 'feed',
					lines: Number.NaN,
				},
			],
		};
		const html = renderHtml(ast as unknown as ReturnType<typeof parseXml>);

		expect(html).toContain('width: 48ch');
		expect(html).toContain('text-align: left');
		expect(html).toContain('font-size: 1em');
		expect(html).toContain('max-width: 200px');
		expect(html).toContain('height: 1.4em');
		expect(html).not.toContain('evil.test');
	});

	it('encodes thermal templates to ESC/POS bytes', () => {
		const bytes = encodeThermalTemplate(THERMAL_TEMPLATE, data, { columns: 32 });
		const decoded = new TextDecoder().decode(bytes);

		expect(bytes).toBeInstanceOf(Uint8Array);
		expect(decoded).toContain('My Test Store');
		expect(decoded).toContain('Widget A');
	});

	it('renders existing ASTs to ESC/POS bytes', () => {
		const ast = parseXml('<receipt><text>Hello ESC/POS</text></receipt>');
		const bytes = renderEscpos(ast);

		expect(new TextDecoder().decode(bytes)).toContain('Hello ESC/POS');
	});
	it('preserves thermal preview markup when only DOMParser is available', () => {
		const originalWindow = globalThis.window;
		const originalDocument = globalThis.document;
		const originalDOMParser = globalThis.DOMParser;
		if (!originalDOMParser) {
			throw new Error('DOMParser is required for this test');
		}

		try {
			globalThis.DOMParser = originalDOMParser;
			// Simulate React Native/browser-adjacent runtimes where XML parsing exists but
			// DOMPurify cannot bind to window.document.
			Reflect.deleteProperty(globalThis, 'window');
			Reflect.deleteProperty(globalThis, 'document');

			const html = renderThermalPreview(
				'<receipt><text>Hello <script>alert(1)</script></text></receipt>',
				{}
			);

			expect(html).toContain('<div>Hello alert(1)</div>');
			expect(html).not.toContain('&lt;div');
			expect(html).not.toContain('<script');
		} finally {
			globalThis.window = originalWindow;
			globalThis.document = originalDocument;
			globalThis.DOMParser = originalDOMParser;
		}
	});
});
