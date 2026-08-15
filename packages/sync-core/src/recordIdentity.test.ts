import { describe, expect, it, vi } from 'vitest';

import {
	identifyRecord,
	isRecordUuid,
	type MetaDataEntry,
	mirrorRecordUuid,
	readRecordUuid,
	RECORD_UUID_META_KEY,
	resolveRecordIdentity,
	webCryptoUuid,
} from './recordIdentity';

const uuidEntry = (value: unknown): MetaDataEntry => ({ key: RECORD_UUID_META_KEY, value });

// Real (v4-shaped) UUIDs — so the suite exercises genuine uuid values, not labels
// that would pass even if the function accepted any non-empty string.
const U_SERVER = '5b8e1a3c-2f4d-4a6b-9c8e-1d2f3a4b5c6d';
const U_MINT = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

describe('isRecordUuid', () => {
	it('accepts uuid-shaped strings (any case), rejects everything else', () => {
		expect(isRecordUuid(U_SERVER)).toBe(true);
		expect(isRecordUuid(U_SERVER.toUpperCase())).toBe(true);
		expect(isRecordUuid('not-a-uuid')).toBe(false);
		expect(isRecordUuid('woo-order:123')).toBe(false); // a legacy prefixed key is NOT a uuid
		expect(isRecordUuid('')).toBe(false);
		expect(isRecordUuid(42)).toBe(false);
		expect(isRecordUuid(null)).toBe(false);
	});
});

describe('readRecordUuid', () => {
	it('returns the mirrored uuid from meta_data', () => {
		expect(readRecordUuid([{ key: 'x', value: 1 }, uuidEntry(U_SERVER)])).toBe(U_SERVER);
	});
	it('returns null when absent, blank, non-string, malformed, or meta missing', () => {
		expect(readRecordUuid([])).toBeNull();
		expect(readRecordUuid([uuidEntry('')])).toBeNull();
		expect(readRecordUuid([uuidEntry(42)])).toBeNull();
		expect(readRecordUuid([uuidEntry('not-a-uuid')])).toBeNull(); // malformed corruption is not adopted
		expect(readRecordUuid(undefined)).toBeNull();
		expect(readRecordUuid(null)).toBeNull();
	});
	it('skips a blank/malformed entry and returns a later valid uuid duplicate', () => {
		expect(readRecordUuid([uuidEntry(''), uuidEntry(U_SERVER)])).toBe(U_SERVER);
		expect(readRecordUuid([uuidEntry('not-a-uuid'), uuidEntry(U_SERVER)])).toBe(U_SERVER);
	});
});

describe('mirrorRecordUuid', () => {
	// mirror is format-agnostic: it mirrors whatever id the resolver decided (which
	// may be a legacy non-uuid key during migration). It guarantees one entry === id.
	it('pushes the uuid when meta_data lacks it (without mutating the input)', () => {
		const input: MetaDataEntry[] = [{ key: 'other', value: 'v' }];
		const out = mirrorRecordUuid(input, U_MINT);
		expect(out).toEqual([{ key: 'other', value: 'v' }, uuidEntry(U_MINT)]);
		expect(input).toEqual([{ key: 'other', value: 'v' }]); // input untouched
	});
	it('keeps an already-canonical entry stable (one entry === id)', () => {
		expect(mirrorRecordUuid([uuidEntry(U_SERVER)], U_SERVER)).toEqual([uuidEntry(U_SERVER)]);
	});
	it('replaces a blank/invalid existing entry so meta mirrors the id', () => {
		expect(mirrorRecordUuid([uuidEntry('')], U_MINT)).toEqual([uuidEntry(U_MINT)]);
		expect(mirrorRecordUuid([uuidEntry(42)], U_MINT)).toEqual([uuidEntry(U_MINT)]);
	});
	it('dedupes duplicate uuid entries down to one canonical entry', () => {
		expect(
			mirrorRecordUuid([uuidEntry(U_SERVER), uuidEntry(U_MINT), { key: 'x', value: 1 }], U_SERVER)
		).toEqual([{ key: 'x', value: 1 }, uuidEntry(U_SERVER)]);
	});
	it('handles null/undefined meta_data', () => {
		expect(mirrorRecordUuid(null, U_MINT)).toEqual([uuidEntry(U_MINT)]);
		expect(mirrorRecordUuid(undefined, U_MINT)).toEqual([uuidEntry(U_MINT)]);
	});
});

describe('resolveRecordIdentity', () => {
	const mintUuid = () => U_MINT;

	it('SERVER-BORN: reuses the uuid from meta_data, meta unchanged', () => {
		const result = resolveRecordIdentity({ metaData: [uuidEntry(U_SERVER)], mintUuid });
		expect(result.id).toBe(U_SERVER);
		expect(result.origin).toBe('server-meta');
		expect(result.metaData).toEqual([uuidEntry(U_SERVER)]);
	});

	it('LOCAL-BORN: mints a uuid and mirrors it into meta_data', () => {
		const result = resolveRecordIdentity({ metaData: [], mintUuid });
		expect(result.id).toBe(U_MINT);
		expect(result.origin).toBe('minted');
		expect(result.metaData).toEqual([uuidEntry(U_MINT)]);
	});

	it('LOCAL-BORN with no meta_data at all: mints + mirrors', () => {
		expect(resolveRecordIdentity({ mintUuid })).toMatchObject({
			id: U_MINT,
			origin: 'minted',
			metaData: [uuidEntry(U_MINT)],
		});
	});

	it('EXISTING key takes precedence (never re-keyed); a legacy non-uuid key is accepted + mirrored', () => {
		const result = resolveRecordIdentity({
			currentId: 'woo-order:123',
			metaData: [{ key: 'x', value: 1 }],
			mintUuid,
		});
		expect(result.id).toBe('woo-order:123'); // currentId is NOT format-validated (migration-safe)
		expect(result.origin).toBe('existing');
		expect(result.metaData).toEqual([{ key: 'x', value: 1 }, uuidEntry('woo-order:123')]);
	});

	it('does NOT mint for a server-born record (generator not called)', () => {
		const spy = vi.fn(() => U_MINT);
		resolveRecordIdentity({ metaData: [uuidEntry(U_SERVER)], mintUuid: spy });
		expect(spy).not.toHaveBeenCalled();
	});

	it('is idempotent: re-resolving a resolved record yields the same id and stable meta', () => {
		const first = resolveRecordIdentity({ metaData: [], mintUuid });
		const second = resolveRecordIdentity({
			currentId: first.id,
			metaData: first.metaData,
			mintUuid,
		});
		expect(second.id).toBe(first.id);
		expect(second.metaData).toEqual(first.metaData);
	});

	it('BLANK/malformed meta uuid: mints and REPLACES the entry (meta ends mirrored)', () => {
		const result = resolveRecordIdentity({ metaData: [uuidEntry('not-a-uuid')], mintUuid });
		expect(result.id).toBe(U_MINT);
		expect(result.origin).toBe('minted');
		expect(result.metaData).toEqual([uuidEntry(U_MINT)]);
	});

	it('mintOnMissing:false throws when a record carries no key or valid uuid (server pull contract)', () => {
		expect(() =>
			resolveRecordIdentity({ metaData: [uuidEntry('not-a-uuid')], mintUuid, mintOnMissing: false })
		).toThrow(/minting is disabled/);
		expect(() => resolveRecordIdentity({ mintUuid, mintOnMissing: false })).toThrow(
			/minting is disabled/
		);
	});

	it('mintOnMissing:false still resolves a server-born or keyed record', () => {
		expect(
			resolveRecordIdentity({ metaData: [uuidEntry(U_SERVER)], mintUuid, mintOnMissing: false }).id
		).toBe(U_SERVER);
		expect(
			resolveRecordIdentity({ currentId: 'woo-order:9', mintUuid, mintOnMissing: false }).id
		).toBe('woo-order:9');
	});

	it('throws on an identity conflict — key disagrees with a valid server uuid (never re-keyed)', () => {
		expect(() =>
			resolveRecordIdentity({ currentId: 'woo-order:1', metaData: [uuidEntry(U_SERVER)], mintUuid })
		).toThrow(/identity conflict/);
	});

	it('does NOT conflict when key matches the server uuid', () => {
		const result = resolveRecordIdentity({
			currentId: U_SERVER,
			metaData: [uuidEntry(U_SERVER)],
			mintUuid,
		});
		expect(result.id).toBe(U_SERVER);
		expect(result.origin).toBe('existing');
	});
});

describe('identifyRecord', () => {
	const mintUuid = () => U_MINT;

	it('SERVER-BORN payload: keys off the meta uuid, preserves other fields, mirrors meta', () => {
		const payload = {
			name: 'Widget',
			price: '9.99',
			meta_data: [{ key: 'x', value: 1 }, uuidEntry(U_SERVER)],
		};
		const result = identifyRecord(payload, { mintUuid });
		expect(result.id).toBe(U_SERVER);
		expect(result.origin).toBe('server-meta');
		expect(result.payload).toEqual({
			name: 'Widget',
			price: '9.99',
			meta_data: [{ key: 'x', value: 1 }, uuidEntry(U_SERVER)],
		});
	});

	it('LOCAL-BORN payload: mints and mirrors the uuid into meta_data', () => {
		const payload = { name: 'New product', meta_data: [] };
		const result = identifyRecord(payload, { mintUuid });
		expect(result.id).toBe(U_MINT);
		expect(result.origin).toBe('minted');
		expect(result.payload.meta_data).toEqual([uuidEntry(U_MINT)]);
		expect(result.payload.name).toBe('New product');
	});

	it('handles a payload with no meta_data field (local-born)', () => {
		const result = identifyRecord({ name: 'X' }, { mintUuid });
		expect(result).toMatchObject({
			id: U_MINT,
			origin: 'minted',
			payload: { name: 'X', meta_data: [uuidEntry(U_MINT)] },
		});
	});

	it('mintOnMissing:false: a server pull missing its identity throws (no divergent mint)', () => {
		expect(() =>
			identifyRecord({ name: 'X', meta_data: [] }, { mintUuid, mintOnMissing: false })
		).toThrow(/minting is disabled/);
	});

	it('does NOT mutate the input payload', () => {
		const payload = { name: 'X', meta_data: [] as MetaDataEntry[] };
		identifyRecord(payload, { mintUuid });
		expect(payload.meta_data).toEqual([]); // input untouched
	});
});

describe('webCryptoUuid', () => {
	it('returns a v4-shaped uuid string', () => {
		expect(webCryptoUuid()).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
		);
	});
});
