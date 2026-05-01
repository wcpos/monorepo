import './install-dom-parser';

import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createRandomReceipt, type ScenarioOverrides } from '../src/randomizer';
import { buildTemplateViewModel, type PaperWidth } from '../src/studio-core';
import { listBundledTemplates } from '../src/template-loader';
import { curatedSnapshotDir, galleryTemplatesDir } from './studio-paths';

const checkMode = process.argv.includes('--check');
const updateMode = process.argv.includes('--update') || !checkMode;
const curatedTemplateIds = new Set(['standard-receipt', 'thermal-simple-80mm']);
const paperWidths: PaperWidth[] = ['80mm'];

interface CuratedScenario {
	id: string;
	seed: number | string;
	overrides: ScenarioOverrides;
}

const curatedScenarios: CuratedScenario[] = [
	{
		id: 'seed-default',
		seed: 'default',
		overrides: {
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
		},
	},
	{
		id: 'seed-empty-cart',
		seed: 'empty-cart',
		overrides: {
			emptyCart: true,
			refund: false,
			rtl: false,
			multicurrency: false,
			multiPayment: false,
			fiscal: false,
			longNames: false,
			hasDiscounts: false,
			hasFees: false,
			hasShipping: false,
		},
	},
	{
		id: 'seed-rtl',
		seed: 'rtl',
		overrides: {
			emptyCart: false,
			refund: false,
			rtl: true,
			multicurrency: false,
			multiPayment: false,
			fiscal: false,
			longNames: false,
			hasDiscounts: false,
			hasFees: false,
			hasShipping: false,
			cartSize: 3,
		},
	},
	{
		id: 'seed-refund',
		seed: 'refund',
		overrides: {
			emptyCart: false,
			refund: true,
			rtl: false,
			multicurrency: false,
			multiPayment: false,
			fiscal: false,
			longNames: false,
			hasDiscounts: false,
			hasFees: false,
			hasShipping: false,
			cartSize: 2,
		},
	},
	{
		id: 'seed-fiscal',
		seed: 'fiscal',
		overrides: {
			emptyCart: false,
			refund: false,
			rtl: false,
			multicurrency: false,
			multiPayment: false,
			fiscal: true,
			longNames: false,
			hasDiscounts: false,
			hasFees: false,
			hasShipping: false,
			cartSize: 2,
		},
	},
	{
		id: 'seed-long-names',
		seed: 'long-names',
		overrides: {
			emptyCart: false,
			refund: false,
			rtl: false,
			multicurrency: false,
			multiPayment: false,
			fiscal: false,
			longNames: true,
			hasDiscounts: false,
			hasFees: false,
			hasShipping: false,
			cartSize: 3,
		},
	},
	{
		id: 'seed-multi-payment',
		seed: 'multi-payment',
		overrides: {
			emptyCart: false,
			refund: false,
			rtl: false,
			multicurrency: false,
			multiPayment: true,
			fiscal: false,
			longNames: false,
			hasDiscounts: false,
			hasFees: false,
			hasShipping: false,
			cartSize: 2,
		},
	},
];

function snapshotName(templateId: string, scenarioId: string, paperWidth: PaperWidth): string {
	return `${templateId}__${scenarioId}__${paperWidth}.json`;
}

async function main() {
	const templates = await listBundledTemplates({
		templatesDir: pathToFileURL(galleryTemplatesDir),
	});
	const curatedTemplates = templates.filter((template) => curatedTemplateIds.has(template.id));
	const missingTemplateIds = [...curatedTemplateIds].filter(
		(id) => !curatedTemplates.some((template) => template.id === id)
	);
	if (missingTemplateIds.length > 0) {
		throw new Error(`Missing curated snapshot templates: ${missingTemplateIds.join(', ')}`);
	}

	await fs.mkdir(curatedSnapshotDir, { recursive: true });
	const stale: string[] = [];
	const written: string[] = [];

	// Drop pre-existing snapshot files that no longer match the curated set so deletions are
	// reflected by `--check`.
	const existing = (await fs.readdir(curatedSnapshotDir)).filter((file) => file.endsWith('.json'));
	const expected = new Set<string>();
	for (const template of curatedTemplates) {
		for (const scenario of curatedScenarios) {
			for (const width of paperWidths) {
				expected.add(snapshotName(template.id, scenario.id, width));
			}
		}
	}
	for (const file of existing) {
		if (!expected.has(file)) {
			const target = path.join(curatedSnapshotDir, file);
			if (checkMode && !updateMode) stale.push(path.relative(process.cwd(), target));
			else {
				await fs.rm(target);
				written.push(`removed ${path.relative(process.cwd(), target)}`);
			}
		}
	}

	for (const template of curatedTemplates) {
		for (const scenario of curatedScenarios) {
			for (const paperWidth of paperWidths) {
				const random = createRandomReceipt({
					seed: scenario.seed,
					overrides: scenario.overrides,
				});
				const fixture = { ...random.data, id: scenario.id };
				const model = buildTemplateViewModel({ template, fixture, paperWidth });
				const serialized = `${JSON.stringify(model, null, '\t')}\n`;
				const file = path.join(
					curatedSnapshotDir,
					snapshotName(template.id, scenario.id, paperWidth)
				);
				let current = '';
				try {
					current = await fs.readFile(file, 'utf8');
				} catch {
					/* new snapshot */
				}
				if (current !== serialized) {
					if (checkMode && !updateMode) stale.push(path.relative(process.cwd(), file));
					else {
						await fs.writeFile(file, serialized);
						written.push(path.relative(process.cwd(), file));
					}
				}
			}
		}
	}

	const summary = [
		`# Template Studio snapshot summary`,
		'',
		`Curated snapshots: ${curatedTemplates.length} templates × ${curatedScenarios.length} seeded scenarios × ${paperWidths.length} widths.`,
		'Each scenario uses a deterministic seed plus explicit overrides so randomizer drift is not silently absorbed.',
		'',
	].join('\n');
	const summaryFile = path.join(curatedSnapshotDir, 'README.md');
	let currentSummary = '';
	try {
		currentSummary = await fs.readFile(summaryFile, 'utf8');
	} catch {
		/* new summary */
	}
	if (currentSummary !== summary) {
		if (checkMode && !updateMode) stale.push(path.relative(process.cwd(), summaryFile));
		else {
			await fs.writeFile(summaryFile, summary);
			written.push(path.relative(process.cwd(), summaryFile));
		}
	}

	if (stale.length > 0) {
		throw new Error(
			`Curated snapshots are stale:\n${stale.join('\n')}\nRun pnpm test:snapshots -- --update to refresh.`
		);
	}
	console.log(
		written.length > 0
			? `Updated ${written.length} curated snapshots.`
			: 'Curated snapshots are current.'
	);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
