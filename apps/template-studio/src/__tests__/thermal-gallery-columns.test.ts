import { describe, expect, it } from 'vitest';

import { analyzeThermalTemplate } from '@wcpos/receipt-renderer';
import { buildTemplateData } from '@wcpos/printer/encoder';

import { galleryTemplatesDir } from '../../scripts/studio-paths';
import { createRandomReceipt } from '../randomizer';
import { listBundledTemplates } from '../template-loader';

import type { ThermalColumns } from '../studio-core';

function columnTargetsForTemplate(paperWidth: string | null | undefined): ThermalColumns[] {
	return paperWidth === '58mm' ? [32] : [42, 48];
}

describe('thermal gallery templates across printer column modes', () => {
	it('does not contain rows wider than the target CPL matrix', async () => {
		const templates = await listBundledTemplates({
			templatesDir: new URL(`file://${galleryTemplatesDir}/`),
		});
		const thermalTemplates = templates.filter((template) => template.engine === 'thermal');
		const receipt = createRandomReceipt({
			seed: 'thermal-columns-long-names',
			overrides: { longNames: true, cartSize: 3 },
		}).data;
		const templateData = buildTemplateData(receipt);

		expect(thermalTemplates.length).toBeGreaterThan(0);

		const failures: string[] = [];
		for (const template of thermalTemplates) {
			for (const columns of columnTargetsForTemplate(template.paperWidth)) {
				const diagnostics = analyzeThermalTemplate(template.content, templateData, { columns });
				diagnostics.rows.forEach((row, index) => {
					if (row.overflows) {
						failures.push(
							`${template.id} row ${index + 1} @ ${columns} CPL resolved to ${row.resolvedTotal}: ${row.texts.join(' | ')}`
						);
					}
					if (row.hasScaledText) {
						failures.push(
							`${template.id} row ${index + 1} @ ${columns} CPL contains scaled text inside a row: ${row.texts.join(' | ')}`
						);
					}
				});
			}
		}

		expect(failures).toEqual([]);
	});
});
