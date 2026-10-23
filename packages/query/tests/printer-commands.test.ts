import {
	deletePrinterProfile,
	ensureSystemPrinterProfile,
	PrinterProfileNotFoundError,
	savePrinterProfile,
	setDefaultPrinterProfile,
	setTemplatePrinterOverride,
} from '../src';
import { StoreDatabaseUnavailableError, SYSTEM_PRINTER_ID } from '../src/commands/printer-profiles';

// These contracts catch duplicate rows, premature demotion, missing guards and leaked documents.
type Row = Record<string, unknown> & { id?: string; template_id?: string };
function fakeCollection(rows: Row[] = []) {
	const calls: string[] = [];
	const document = (row: Row) => ({
		...row,
		patch: jest.fn(async function (this: Row, patch: Row) {
			calls.push(`patch:${this.id}`);
			Object.assign(this, patch);
		}),
		remove: jest.fn(async () => {
			docs.splice(
				docs.findIndex((doc) => doc.id === row.id && doc.template_id === row.template_id),
				1
			);
		}),
	});
	const docs = rows.map(document);
	const match = (selector: Row = {}) =>
		docs.filter((doc) => Object.entries(selector).every(([key, value]) => doc[key] === value));
	return {
		docs,
		calls,
		insert: jest.fn(async (row: Row) => {
			calls.push(`insert:${row.id}`);
			docs.push(document(row));
		}),
		upsert: jest.fn(async (row: Row) => {
			const existing = docs.find((doc) => doc.template_id === row.template_id);
			if (existing) Object.assign(existing, row);
			else docs.push(document(row));
		}),
		find: (query?: { selector: Row }) => ({ exec: async () => match(query?.selector) }),
		findOne: (query: string | { selector: Row }) => ({
			exec: async () =>
				typeof query === 'string'
					? (docs.find((doc) => (doc.id ?? doc.template_id) === query) ?? null)
					: (match(query.selector)[0] ?? null),
		}),
	};
}
const fields = {
	name: 'TM-m30III',
	address: '192.168.1.131',
	port: 443,
	vendor: 'epson',
	language: 'esc-pos',
	connectionType: 'network',
	columns: 48,
	autoCut: true,
	autoOpenDrawer: false,
	isDefault: false,
} as const;
const databaseFor = (collection: ReturnType<typeof fakeCollection>) => ({
	collections: { printer_profiles: collection, template_printer_overrides: collection },
});
const commands = {
	savePrinterProfile,
	ensureSystemPrinterProfile,
	setDefaultPrinterProfile,
	deletePrinterProfile,
	setTemplatePrinterOverride,
};
it.each(Object.entries(commands))('%s is a public command', (_name, command) => {
	expect(typeof command).toBe('function');
});

it('updates the row that already has the address instead of adding a twin', async () => {
	const collection = fakeCollection([{ id: 'existing', address: fields.address }]);
	expect(
		await savePrinterProfile(databaseFor(collection), fields, { reuseByAddress: true })
	).toEqual({ id: 'existing', created: false });
	expect(collection.insert).not.toHaveBeenCalled();
	expect(collection.docs[0].patch).toHaveBeenCalledWith(fields);
});
it('inserts when the address is new', async () => {
	const collection = fakeCollection([{ id: 'other', address: '192.168.1.150' }]);
	const result = await savePrinterProfile(databaseFor(collection), fields, {
		reuseByAddress: true,
	});
	expect(result).toEqual({
		id: expect.stringMatching(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i),
		created: true,
	});
	expect(collection.insert).toHaveBeenCalledWith({ id: result.id, ...fields });
});
it('does not reuse an address unless requested', async () => {
	const collection = fakeCollection([{ id: 'twin', address: fields.address }]);
	expect((await savePrinterProfile(databaseFor(collection), fields)).created).toBe(true);
	expect(collection.docs[0].patch).not.toHaveBeenCalled();
});
it('patches the requested id even when another row has the address', async () => {
	const collection = fakeCollection([{ id: 'target' }, { id: 'twin', address: fields.address }]);
	expect(
		await savePrinterProfile(databaseFor(collection), fields, {
			id: 'target',
			reuseByAddress: true,
		})
	).toEqual({ id: 'target', created: false });
	expect(collection.docs[0].patch).toHaveBeenCalledWith(fields);
	expect(collection.docs[1].patch).not.toHaveBeenCalled();
	expect(collection.insert).not.toHaveBeenCalled();
});
it('rejects an unknown id without inserting or demoting', async () => {
	const collection = fakeCollection([{ id: 'old', isDefault: true }]);
	const error = await savePrinterProfile(
		databaseFor(collection),
		{ ...fields, isDefault: true },
		{ id: 'missing' }
	).catch((e) => e);
	expect(error).toBeInstanceOf(PrinterProfileNotFoundError);
	expect(error.id).toBe('missing');
	expect(collection.calls).toEqual([]);
});
it.each([false, true])('demotes only after the target write (patch=%s)', async (patch) => {
	const collection = fakeCollection([{ id: 'old', isDefault: true }, { id: 'target' }]);
	const result = await savePrinterProfile(
		databaseFor(collection),
		{ ...fields, isDefault: true },
		patch ? { id: 'target' } : undefined
	);
	expect(collection.calls).toEqual([`${patch ? 'patch' : 'insert'}:${result.id}`, 'patch:old']);
	expect(collection.docs[0].isDefault).toBe(false);
});
it.each([false, true])('keeps the previous default on failed save (patch=%s)', async (patch) => {
	const collection = fakeCollection([{ id: 'old', isDefault: true }, { id: 'target' }]);
	(patch ? collection.docs[1].patch : collection.insert).mockRejectedValueOnce(new Error('failed'));
	await expect(
		savePrinterProfile(
			databaseFor(collection),
			{ ...fields, isDefault: true },
			patch ? { id: 'target' } : undefined
		)
	).rejects.toThrow('failed');
	expect(collection.docs[0].patch).not.toHaveBeenCalled();
});
it.each([false, true])('ensures the built-in once; existing default=%s', async (hasDefault) => {
	const collection = fakeCollection([{ id: 'other', isDefault: hasDefault }]);
	const database = databaseFor(collection);
	expect(await ensureSystemPrinterProfile(database)).toBe('created');
	expect(collection.insert).toHaveBeenCalledWith({
		id: '__system__',
		name: 'Print Dialog',
		connectionType: 'system',
		vendor: 'generic',
		language: 'esc-pos',
		columns: 42,
		port: 9100,
		autoCut: false,
		autoOpenDrawer: false,
		isDefault: !hasDefault,
		isBuiltIn: true,
	});
	expect(SYSTEM_PRINTER_ID).toBe('__system__');
	expect(await ensureSystemPrinterProfile(database)).toBe('present');
	expect(collection.insert).toHaveBeenCalledTimes(1);
});
it('sets default in collection order, leaves non-defaults alone, and ignores unknown ids', async () => {
	const collection = fakeCollection([
		{ id: 'old', isDefault: true },
		{ id: 'target' },
		{ id: 'other' },
	]);
	const database = databaseFor(collection);
	expect(await setDefaultPrinterProfile(database, 'missing')).toBe(false);
	expect(collection.calls).toEqual([]);
	expect(await setDefaultPrinterProfile(database, 'target')).toBe(true);
	expect(collection.calls).toEqual(['patch:old', 'patch:target']);
	expect(collection.docs.map((doc) => doc.isDefault)).toEqual([false, true, undefined]);
	await setDefaultPrinterProfile(database, 'target');
	expect(collection.calls).toHaveLength(2);
});
it('deletes only a found, non-built-in profile', async () => {
	const collection = fakeCollection([{ id: '__system__', isBuiltIn: true }, { id: 'counter' }]);
	const database = databaseFor(collection);
	expect(await deletePrinterProfile(database, 'missing')).toBe(false);
	expect(await deletePrinterProfile(database, '__system__')).toBe(false);
	expect(await deletePrinterProfile(database, 'counter')).toBe(true);
	expect(collection.docs.map((doc) => doc.id)).toEqual(['__system__']);
});
it('sets, replaces and clears a routing override, including an absent override', async () => {
	const collection = fakeCollection();
	const database = databaseFor(collection);
	await setTemplatePrinterOverride(database, 'receipt', 'counter');
	await setTemplatePrinterOverride(database, 'receipt', 'kitchen');
	expect(collection.docs).toHaveLength(1);
	expect(collection.upsert).toHaveBeenLastCalledWith({
		template_id: 'receipt',
		printer_profile_id: 'kitchen',
	});
	await setTemplatePrinterOverride(database, 'receipt', null);
	await setTemplatePrinterOverride(database, 'receipt', null);
	expect(collection.docs).toEqual([]);
});
it.each([null, undefined])('rejects every write without a database (%s)', async (database) => {
	for (const write of [
		() => savePrinterProfile(database, fields),
		() => ensureSystemPrinterProfile(database),
		() => setDefaultPrinterProfile(database, 'counter'),
		() => deletePrinterProfile(database, 'counter'),
		() => setTemplatePrinterOverride(database, 'receipt', 'counter'),
	])
		await expect(write()).rejects.toBeInstanceOf(StoreDatabaseUnavailableError);
});
