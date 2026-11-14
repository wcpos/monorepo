import { normalizeSelectorSemantics as normalize } from '../../src/engine-adapter/normalize-selector';

const outside = { $or: [{ f: { $nin: ['blue', 2] } }, { f: { $eq: null } }] };
const cases = [
	[{ f: { $exists: false } }, { f: { $eq: null } }],
	[{ f: { $exists: true } }, { f: { $ne: null } }],
	[{ f: { $nin: ['blue', 2] } }, outside],
	[{ f: { $nin: ['blue', 2], $gt: 1 } }, { $and: [{ f: { $gt: 1 } }, outside] }],
	[
		{ $and: [{ f: { $exists: true } }], g: 2 },
		{ $and: [{ f: { $ne: null } }], g: 2 },
	],
	[{ $or: [{ f: { $exists: false } }] }, { $or: [{ f: { $eq: null } }] }],
	[{ $nor: [{ f: { $exists: false } }] }, { $nor: [{ f: { $eq: null } }] }],
	[{ items: { $elemMatch: { f: { $nin: ['blue', 2] } } } }, { items: { $elemMatch: outside } }],
	[
		{ f: { $eq: { $exists: false } }, g: { $regex: 'blue', $options: 'i' } },
		{ f: { $eq: { $exists: false } }, g: { $regex: 'blue', $options: 'i' } },
	],
] as const;

it.each(cases)('rewrites %j without mutation and is idempotent', (input, expected) => {
	const before = JSON.stringify(input);
	const result = normalize(input);
	expect(result).toEqual(expected);
	expect(result).not.toBe(input);
	expect(JSON.stringify(input)).toBe(before);
	expect(normalize(result)).toEqual(result);
});
