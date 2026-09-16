/** Opt-in, sequential storage scan benchmark. No timing assertions or production changes. */
import { appendFileSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { RxDBFlexSearchPlugin } from 'rxdb-premium/plugins/flexsearch';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';
import { getRxStorageFilesystemNode } from 'rxdb-premium/plugins/storage-filesystem-node';

import { escapeRegex, foldSearchText } from '@wcpos/sync-core';

import { searchPlugin } from './plugins/search';

import type { RxCollection, RxDocument, RxJsonSchema, RxStorage } from 'rxdb';

jest.mock('@wcpos/utils/logger', () => ({
	getLogger: jest.fn(() => ({
		debug: jest.fn(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
	})),
}));

const describeBench = process.env.CATALOGUE_SCALE_BENCH ? describe : describe.skip;
const sizes = (process.env.PROBE_ROWS ?? '2000,20000').split(',').map(Number);
const storages = (process.env.PROBE_STORAGE ?? 'memory,fs').split(',');
const words =
	`cotton linen wool silk leather wooden ceramic glass steel copper brass silver golden red blue green yellow orange purple white black grey brown natural soft warm cool light heavy small large medium round square smooth woven organic recycled handmade classic modern vintage bottle basket towel blanket pillow candle soap brush comb mirror bowl plate cup mug spoon fork knife tray jar box bag pouch wallet belt scarf hat shirt socks shoes boots jacket sweater apron chair table shelf lamp clock frame notebook pencil pen
paper ribbon garden kitchen bathroom travel Baumwolle Leinen Wolle Seide Leder Holz Keramik Glas Stahl Kupfer Messing Silber Gold rot blau grün gelb weiß schwarz grau braun weich warm kühl leicht schwer klein groß rund quadratisch glatt gewebt natürlich nachhaltig handgemacht klassisch modern Tasche Beutel Korb Handtuch Decke Kissen Kerze Bürste Kamm Spiegel Schüssel Teller Tasse Löffel Gabel Messer Edelstahltrinkflasche Regenschirm Kaffeemaschine Schneidebrett Blumenvase Frühstücksdose puuvilla pellava villa silkki nahka puinen keraaminen lasi teräs kupari hopea kultainen punainen sininen vihreä keltainen valkoinen musta harmaa
ruskea pehmeä lämmin kevyt pieni suuri pyöreä sileä kudottu luonnollinen käsintehty laukku kori pyyhe peitto tyyny kynttilä harja kampa peili kulho lautanen kuppi lusikka haarukka veitsi Kuorintasaippua juomapullo sateenvarjo kahvinkeitin leikkuulauta kukkamaljakko eväsrasia villasukat keittiö puutarha coton laine soie cuir bois céramique verre acier cuivre argent doré rouge bleu vert jaune blanc noir gris brun doux chaud léger petit grand rond lisse tissé naturel durable artisanal sac panier serviette couverture coussin bougie savon brosse peigne miroir bol assiette tasse cuillère fourchette couteau bouteille parapluie
cafetière cuisine jardin voyage lavande cèdre algodón lino lana seda cuero madera cerámica vidrio acero cobre plata dorado rojo azul verde amarillo blanco negro gris marrón suave cálido ligero pequeño grande redondo liso tejido natural sostenible artesanal bolsa cesta toalla manta almohada vela jabón cepillo peine espejo cuenco plato taza cuchara tenedor cuchillo botella paraguas cafetera cocina jardín viaje limón naranja canela vainilla romero lavanda menta café té miel azúcar sal pimienta`.split(
		/\s+/
	);
type Product = {
	uuid: string;
	searchFold: { name: string; sku: string; barcode: string };
	payload: Record<string, unknown> & { name: string; sku: string; barcode: string };
};
type Sidecar = { uuid: string; fold: string };
type Hits = readonly { uuid: string }[] | Map<string, RxDocument<Product>> | number;
type SearchIndex = {
	pipeline: { awaitIdle(): Promise<void> };
	find(term: string, options: { limit: number }): Promise<RxDocument<Product>[]>;
};
const uuid = { type: 'string', maxLength: 128 } as const;
const productSchema: RxJsonSchema<Product> = {
	version: 0,
	primaryKey: 'uuid',
	type: 'object',
	indexes: [],
	properties: {
		uuid,
		searchFold: {
			type: 'object',
			properties: {
				name: { type: 'string' },
				sku: { type: 'string' },
				barcode: { type: 'string' },
			},
			required: ['name', 'sku', 'barcode'],
		},
		payload: { type: 'object', additionalProperties: true },
	},
	required: ['uuid', 'searchFold', 'payload'],
};
const sidecarSchema = {
	version: 0,
	primaryKey: 'uuid',
	type: 'object',
	indexes: [],
	properties: { uuid, fold: { type: 'string', maxLength: 600 } },
	required: ['uuid', 'fold'],
} as RxJsonSchema<Sidecar>;
function catalogue(n: number): Product[] {
	let state = 2082;
	const random = () => {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		return state / 2 ** 32;
	};
	const pick = () => words[Math.floor(random() * words.length)];
	const prose = (length: number) => Array.from({ length }, pick).join(' ').slice(0, length);
	const entries = (min: number, max: number) =>
		Array.from({ length: min + Math.floor(random() * (max - min + 1)) }, (_, i) => i);
	return Array.from({ length: n }, (_, i) => {
		const id = i + 1;
		const nameWords = Array.from({ length: 2 + Math.floor(random() * 4) }, pick);
		// A controlled ~7% common cohort plus natural word-list occurrences; nonempty AND query.
		if (random() < 0.07) {
			nameWords[0] = 'cotton';
			if (random() < 0.35) nameWords[1] = 'linen';
		}
		const name = nameWords.join(' ');
		const sku = `SKU-${String(id).padStart(6, '0')}-AB`;
		const barcode = `590${String(id).padStart(9, '0')}${id % 10}`;
		const price = (5 + random() * 95).toFixed(2);
		const payload = {
			id,
			name,
			slug: foldSearchText(name).replace(/\s+/g, '-'),
			sku,
			barcode,
			price,
			regular_price: price,
			stock_status: 'instock',
			type: 'simple',
			description: prose(600),
			short_description: prose(150),
			images: entries(1, 3).map((j) => ({
				id: id * 10 + j,
				src: `https://catalogue.example.com/wp-content/uploads/2026/09/product-${String(id).padStart(6, '0')}-${j}-large.jpg`,
			})),
			categories: entries(1, 3).map((j) => ({ id: j + 1, name: words[j], slug: words[j] })),
			attributes: entries(0, 2).map((j) => ({
				id: j,
				name: j ? 'Material' : 'Colour',
				options: [pick()],
			})),
			meta_data: entries(4, 6).map((j) => ({
				id: id * 10 + j,
				key: `_catalogue_${j}`,
				value: prose(35),
			})),
		};
		return {
			uuid: `product-${String(id).padStart(6, '0')}`,
			payload,
			searchFold: {
				name: foldSearchText(name),
				sku: foldSearchText(sku),
				barcode: foldSearchText(barcode),
			},
		};
	});
}
function progress(line: string): void {
	process.stdout.write(`${line}\n`);
	if (process.env.PROBE_PROGRESS) appendFileSync(process.env.PROBE_PROGRESS, `${line}\n`);
}
function directoryBytes(path: string): number {
	const stat = statSync(path);
	return stat.isDirectory()
		? readdirSync(path).reduce((sum, name) => sum + directoryBytes(join(path, name)), 0)
		: stat.size;
}
function ids(docs: readonly { uuid: string }[]): string[] {
	return docs.map((doc) => doc.uuid).sort();
}
function agree(label: string, actual: string[], expected: string[]): boolean {
	const a = new Set(actual),
		b = new Set(expected);
	if (actual.join('\n') !== expected.join('\n')) {
		progress(
			`Mismatch ${label}: only actual=${JSON.stringify(actual.filter((id) => !b.has(id)))}; only expected=${JSON.stringify(expected.filter((id) => !a.has(id)))}`
		);
	}
	return actual.join('\n') === expected.join('\n');
}
// Evict RxQuery memoization, not storage/OS/document caches. Otherwise runs 2–6 do not scan.
async function measure<T>(run: () => Promise<T>, reset: () => void, check: (value: T) => void) {
	const times: number[] = [];
	for (let i = 0; i < 6; i += 1) {
		reset();
		const start = performance.now();
		const value = await run();
		const elapsed = performance.now() - start;
		check(value); // Hit-set comparisons are outside the timer, including warm-up.
		if (i) times.push(elapsed);
	}
	times.sort((a, b) => a - b);
	return { median: times[2], max: times[4] };
}
describeBench('catalogue search scale', () => {
	const tempDirs: string[] = [];
	beforeAll(() => {
		setPremiumFlag();
		addRxPlugin(RxDBFlexSearchPlugin);
		addRxPlugin(RxDBMigrationSchemaPlugin);
		addRxPlugin(searchPlugin);
		progress(
			`Catalogue bench: node=${process.version}; platform=${process.platform}/${process.arch}; words=${words.length}; gc=${Boolean(global.gc)}.`
		);
		progress(
			'allowSlowCount=true; case-sensitive regex on folded columns (no $options). One warm-up, five measured runs; RxQuery cache evicted each run; storage/OS and RxDocument caches remain warm.'
		);
		progress(
			'Index find includes document materialisation; C materialisation is warm findByIds, not cold disk IO. No public collection.closeSearch: index remains resident until db.remove(). Row bytes below mean JSON.stringify(stored doc).length (UTF-16 units); UTF-8 bytes also reported.'
		);
	});
	afterAll(() => {
		for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
	});
	for (const storageName of storages) {
		it(`compares exact hit sets on ${storageName}`, async () => {
			if (!['memory', 'fs'].includes(storageName))
				throw new Error(`Unknown storage: ${storageName}`);
			let matches = true;
			const table = [
				'| N | path | query | hits | median ms | max ms |',
				'| ---: | --- | --- | ---: | ---: | ---: |',
			];
			progress(`\n## ${storageName}\n`);
			for (const n of sizes) {
				const basePath =
					storageName === 'fs' ? mkdtempSync(join(tmpdir(), 'catalogue-scale-')) : '';
				if (basePath) tempDirs.push(basePath);
				const db = await createRxDatabase({
					name: `catalogue_${storageName}_${n}_${Date.now()}`,
					storage: (storageName === 'fs'
						? getRxStorageFilesystemNode({ basePath })
						: getRxStorageMemory()) as RxStorage<unknown, unknown>,
					multiInstance: false,
					allowSlowCount: true,
				});
				try {
					const collections = await db.addCollections({
						products: {
							schema: productSchema,
							options: { searchFields: ['payload.name', 'payload.sku', 'payload.barcode'] },
						},
						productSearch: { schema: sidecarSchema },
					});
					const products = collections.products as RxCollection<Product>;
					const sidecar = collections.productSearch as RxCollection<Sidecar>;
					progress(`N=${n}: seeding products + sidecar`);
					const seedStart = performance.now();
					let rows = catalogue(n);
					const rare = rows[Math.min(1233, n - 1)].payload.sku.slice(5, 11);
					let rowBytes = 0,
						utf8Bytes = 0;
					for (let offset = 0; offset < n; offset += 500) {
						const batch = rows.slice(offset, offset + 500);
						const inserted = await products.bulkInsert(batch);
						if (inserted.error.length) throw new Error(JSON.stringify(inserted.error));
						for (const doc of inserted.success) {
							const json = JSON.stringify(doc.toJSON(true));
							rowBytes += json.length;
							utf8Bytes += Buffer.byteLength(json);
						}
						const result = await sidecar.bulkInsert(
							batch.map(({ uuid: key, payload }) => ({
								uuid: key,
								fold: foldSearchText(`${payload.name} ${payload.sku} ${payload.barcode}`),
							}))
						);
						if (result.error.length) throw new Error(JSON.stringify(result.error));
					}
					rows = [];
					const seedMs = performance.now() - seedStart;
					const dirBytes = basePath ? directoryBytes(basePath) : 0;
					const split = basePath
						? Object.fromEntries(
								readdirSync(basePath).map((name) => [
									name.replace(`rxdb-${db.name}-`, ''),
									directoryBytes(join(basePath, name)),
								])
							)
						: {};
					global.gc?.();
					const heapBefore = process.memoryUsage().heapUsed;
					progress(`N=${n}: building production FlexSearch index`);
					const buildStart = performance.now();
					const instance = (await products.initSearch!('en')) as unknown as SearchIndex;
					await instance.pipeline.awaitIdle();
					const buildMs = performance.now() - buildStart;
					global.gc?.();
					const heapDelta = (process.memoryUsage().heapUsed - heapBefore) / 1024 ** 2;
					progress(
						`N=${n}: seed=${seedMs.toFixed(2)} ms; build=${buildMs.toFixed(2)} ms; heap delta=${heapDelta.toFixed(2)} MB; avg row bytes=${(rowBytes / n).toFixed(2)}; avg UTF-8 bytes=${(utf8Bytes / n).toFixed(2)}; dir bytes after seed=${dirBytes}; split=${JSON.stringify(split)}`
					);
					const reset = () => {
						products._queryCache._map.clear();
						sidecar._queryCache._map.clear();
					};
					for (const [label, term] of [
						['common', 'cotton'],
						['midword', 'saippua'],
						['rare', rare],
						['two-terms', 'cotton linen'],
					]) {
						progress(`N=${n}: measuring ${label} (${term})`);
						const terms = foldSearchText(term).split(/\s+/);
						const selector = {
							$and: terms.map((part) => ({
								$or: ['name', 'sku', 'barcode'].map((field) => ({
									[`searchFold.${field}`]: { $regex: escapeRegex(part) },
								})),
							})),
						};
						const sideSelector = {
							$and: terms.map((part) => ({ fold: { $regex: escapeRegex(part) } })),
						};
						// Untimed reference scan; each measured execution below must return these same IDs.
						const expected = ids(await products.find({ selector }).exec());
						const record = async (path: string, run: () => Promise<Hits>, want = expected) => {
							let hits: string[] = [],
								count = 0;
							const result = await measure(run, reset, (value) => {
								if (typeof value === 'number') {
									count = value;
									expect(value).toBe(want.length);
								} else {
									hits = ids(value instanceof Map ? [...value.values()] : value);
									count = hits.length;
									matches = agree(`${n}/${label}/${path}`, hits, want) && matches;
								}
							});
							table.push(
								`| ${n} | ${path} | ${label}: ${term} | ${count} | ${result.median.toFixed(2)} | ${result.max.toFixed(2)} |`
							);
							return hits;
						};
						await record('A index full', () =>
							instance.find(term, { limit: Number.MAX_SAFE_INTEGER })
						);
						for (const [path, collection, query] of [
							['B inline', products, selector],
							['C sidecar', sidecar, sideSelector],
						] as const) {
							const page = await record(
								`${path} page`,
								() => collection.find({ selector: query, limit: 20 }).exec(),
								expected.slice(0, 20)
							);
							await record(`${path} full`, () => collection.find({ selector: query }).exec());
							if (path === 'B inline') {
								await record('B inline count', () => products.count({ selector }).exec());
							} else {
								await record('C materialise page', () => products.findByIds(page).exec(), page);
							}
						}
					}
				} finally {
					await db.remove();
				}
			}
			progress(`\n${table.join('\n')}\n`);
			expect(matches).toBe(true);
		}, 900_000);
	}
});
