import {
	fillWithDefaultSettings,
	getQueryMatcher,
	getSortComparator,
	normalizeMangoQuery,
	prepareQuery,
	type RxDocumentData,
	type RxJsonSchema,
} from 'rxdb/plugins/core';

import { stamp } from './fixtures';

import type { Session } from './engines';
import type { ConformanceResult } from './conformance-smoke';
type Probe = { id: string; value?: string | number | null; name: string };
const schema = fillWithDefaultSettings<Probe>({
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string', maxLength: 64 },
		value: { type: ['number', 'string', 'null'] },
		name: { type: 'string', maxLength: 64 },
	},
	required: ['id', 'name'],
	indexes: [],
} as RxJsonSchema<Probe>);
export async function divergenceProbes(session: Session): Promise<ConformanceResult[]> {
	const instance = await session.create('divergence', schema);
	const values = [null, undefined, 'blue', 'red', 2, '2', 10, '10'];
	const names = ['a', 'A', 'é', 'e', 'Z', 'z', 'Á', 'ä'];
	const docs = values.map((value, i) => ({
		id: `p${i}`,
		...(value === undefined ? {} : { value }),
		name: names[i],
		...stamp(i),
	}));
	const written = await instance.bulkWrite(
		docs.map((document) => ({ document })),
		'divergence'
	);
	if (written.error.length) throw new Error(JSON.stringify(written.error));
	const probes = [
		{
			name: 'exists-explicit-null',
			queries: [
				{ selector: { value: { $exists: false } } },
				{ selector: { value: { $exists: true } } },
			],
		},
		{
			name: 'in-nin-missing',
			queries: [
				{ selector: { value: { $in: ['blue', 2] } } },
				{ selector: { value: { $nin: ['blue', 2] } } },
			],
		},
		{
			name: 'sort-case-accents-mixed-types',
			queries: [
				{ selector: {}, sort: [{ name: 'asc' as const }] },
				{ selector: {}, sort: [{ value: 'asc' as const }] },
			],
		},
	];
	const results: ConformanceResult[] = [];
	try {
		for (const probe of probes) {
			const details: string[] = [];
			let pass = true;
			try {
				for (const input of probe.queries) {
					const q = normalizeMangoQuery<RxDocumentData<Probe>>(schema, {
						...input,
						selector: { ...input.selector, _deleted: false },
					});
					const expected = docs
						.filter(getQueryMatcher(schema, q))
						.sort(getSortComparator(schema, q))
						.map((d) => d.id);
					const actual = (await instance.query(prepareQuery(schema, q))).documents.map((d) => d.id);
					const equal = JSON.stringify(actual) === JSON.stringify(expected);
					pass &&= equal;
					details.push(JSON.stringify({ query: input, expected, actual, pass: equal }));
				}
			} catch (error) {
				pass = false;
				details.push(String(error));
			}
			results.push({ name: probe.name, pass, detail: details.join('; ') });
		}
	} finally {
		await instance.close();
	}
	return results;
}
