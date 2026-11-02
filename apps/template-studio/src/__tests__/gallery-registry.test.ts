// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { galleryTemplatesDir } from '../../scripts/studio-paths';
import { gallerySkipReason } from '../test/gallery-environment';
import { parseGalleryRegistry } from '../gallery-registry';
import { listBundledTemplates } from '../template-loader';

const fixture = `${process.cwd()}/src/test/fixtures`;

describe('PHP gallery registry', () => {
	it('reads three verbatim plugin entries, translations, apostrophes and omitted width', async () => {
		const entries = parseGalleryRegistry(await readFile(`${fixture}/gallery-registry.php`, 'utf8'));
		expect(Object.keys(entries)).toEqual([
			'detailed-receipt',
			'narrow-receipt',
			'thermal-simple-80mm-rtl',
		]);
		expect(entries['detailed-receipt']).toMatchObject({
			title: 'Detailed Receipt',
			engine: 'logicless',
			paper_width: null,
			version: 1,
		});
		expect(entries['narrow-receipt']).not.toHaveProperty('paper_width');
		expect(entries['thermal-simple-80mm-rtl']).toMatchObject({
			engine: 'thermal',
			paper_width: '80mm',
		});
		expect(entries['thermal-simple-80mm-rtl'].description).toContain("printer's manual");
	});

	it('skips nested arrays without leaking their fields and handles scalar values and comments', () => {
		const entries = parseGalleryRegistry(String.raw`<?php return array(
			// 'fake' => array('engine' => 'php'),
			'first' => array(
				'title' => __( 'A ) array( \'quoted\' title', 'domain' ),
				'preview_state' => array('engine' => 'php', 'nested' => array('x' => ')')),
				'preview_data' => ['title' => 'ignored', ['deep' => true]],
				'engine' => 'thermal', /* ) 'not-a-key' => array( */
				'order' => -12, 'screen' => true, 'disabled' => false, 'paper_width' => null,
				'path' => 'C:\\templates\q', 'description' => "double quoted",
			),
			'second' => array('engine' => 'logicless'),
		);`);
		expect(entries).toEqual({
			first: {
				title: "A ) array( 'quoted' title",
				engine: 'thermal',
				order: -12,
				screen: true,
				disabled: false,
				paper_width: null,
				path: 'C:\\templates\\q',
				description: 'double quoted',
			},
			second: { engine: 'logicless' },
		});
	});

	it('reports an incomplete registry instead of silently returning a partial catalogue', () => {
		expect(() => parseGalleryRegistry("'broken' => array('engine' => 'thermal'")).toThrow();
	});

	it('loads registry titles and content while skipping unsupported engines and missing files', async () => {
		const templates = await listBundledTemplates({
			templatesDir: pathToFileURL(`${fixture}/templates/`),
			registryPath: `${fixture}/templates/registry.php`,
		});
		expect(templates.map(({ id }) => id)).toEqual(['logicless-sample', 'thermal-sample']);
		expect(templates[1]).toMatchObject({ engine: 'thermal', paperWidth: '80mm' });
		expect(templates[0].content).toContain('<');
	});

	it('fails when a configured registry is missing', async () => {
		await expect(
			listBundledTemplates({
				templatesDir: pathToFileURL(`${fixture}/templates/`),
				registryPath: `${fixture}/missing.php`,
			})
		).rejects.toThrow('ENOENT');
	});
});

it.skipIf(Boolean(gallerySkipReason))(
	gallerySkipReason ?? 'loads the plugin gallery from the configured checkout',
	async () => {
		const templates = await listBundledTemplates({
			templatesDir: pathToFileURL(galleryTemplatesDir),
		});
		expect(templates.some(({ engine }) => engine === 'thermal')).toBe(true);
		expect(templates.some(({ engine }) => engine === 'logicless')).toBe(true);
		expect(templates.every(({ content }) => content.length > 0)).toBe(true);
	}
);
