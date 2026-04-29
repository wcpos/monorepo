import { describe, expect, it } from 'vitest';

import {
	buildTemplateViewModel,
	bytesToDebugOutput,
	renderStudioTemplate,
	selectVisibleTemplate,
} from '../studio-core';
import { listBundledTemplates } from '../template-loader';
import galleryFixture from '../../fixtures/gallery-default-receipt.json';

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
});
