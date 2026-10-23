import { BehaviorSubject, firstValueFrom, Subject } from 'rxjs';
import { map } from 'rxjs/operators';

import {
	observeScannerProfiles,
	readScannerProfiles,
	removeScannerProfile,
	saveScannerProfile,
	type ScannerProfile,
} from '../../src/store-local';
import { StoreDatabaseUnavailableError } from '../../src/commands/printer-profiles';

import type { ScannerConnectionType } from '../../src/store-local/scanner-profiles';

const keyboard: ScannerProfile = {
	deviceKey: 'keyboard:1234:5678:acme scanner',
	connectionType: 'keyboard',
	deviceName: 'ACME Scanner',
	name: 'Counter',
	vendorId: 1234,
	productId: 5678,
	createdAt: '2026-10-18T10:00:00.000Z',
};
const serial: ScannerProfile = {
	deviceKey: 'usb-serial:1234:5678',
	connectionType: 'usb-serial',
	deviceName: 'Serial scanner',
};

type Query = {
	selector: { connectionType: ScannerConnectionType | { $in: ScannerConnectionType[] } };
};
function fakeCollection(initial: ScannerProfile[] = []) {
	const rows = new Map(initial.map((row) => [row.deviceKey, row]));
	const changes$ = new BehaviorSubject(0);
	const document = (row: ScannerProfile) => ({
		toJSON: () => ({ ...row }),
		remove: async () => {
			if (!rows.delete(row.deviceKey)) throw new Error('already removed');
			changes$.next(changes$.value + 1);
		},
	});
	return {
		name: 'scanner_profiles',
		find: jest.fn((query?: Query) => {
			const selected = query?.selector.connectionType;
			const docs = () =>
				[...rows.values()]
					.filter(
						(row) =>
							!selected ||
							(typeof selected === 'string'
								? row.connectionType === selected
								: selected.$in.includes(row.connectionType))
					)
					.map(document);
			return { $: changes$.pipe(map(docs)), exec: async () => docs() };
		}),
		findOne: jest.fn((key: string) => ({
			exec: async () => (rows.has(key) ? document(rows.get(key)!) : null),
		})),
		upsert: jest.fn(async (row: ScannerProfile) => {
			rows.set(row.deviceKey, row);
			changes$.next(changes$.value + 1);
		}),
	};
}
const databaseFor = (collection = fakeCollection([keyboard, serial])) => ({
	collections: { scanner_profiles: collection },
});

// These catch lost transport filters, leaked documents, insert-vs-upsert and stale deletion.
it.each([
	[undefined, undefined, [keyboard, serial]],
	[[], undefined, [keyboard, serial]],
	[['keyboard'], { selector: { connectionType: 'keyboard' } }, [keyboard]],
	[
		['keyboard', 'usb-serial'],
		{ selector: { connectionType: { $in: ['keyboard', 'usb-serial'] } } },
		[keyboard, serial],
	],
] as const)(
	'observes and reads JSON rows with the requested selector (%j)',
	async (types, query, expected) => {
		const db = databaseFor();
		expect(await firstValueFrom(observeScannerProfiles(db, types))).toEqual(expected);
		expect(await readScannerProfiles(db, types)).toEqual(expected);
		if (query) expect(db.collections.scanner_profiles.find).toHaveBeenNthCalledWith(1, query);
		else expect(db.collections.scanner_profiles.find).toHaveBeenNthCalledWith(1);
		if (query) expect(db.collections.scanner_profiles.find).toHaveBeenNthCalledWith(2, query);
		else expect(db.collections.scanner_profiles.find).toHaveBeenNthCalledWith(2);
	}
);

it('follows replacement collections and resolves one-shot reads at call time', async () => {
	const reset$ = new Subject<ReturnType<typeof fakeCollection>>();
	const db = { ...databaseFor(), reset$ };
	const values: ScannerProfile[][] = [];
	const subscription = observeScannerProfiles(db, ['keyboard']).subscribe((rows) =>
		values.push(rows)
	);
	const replacement = fakeCollection([{ ...keyboard, name: 'Replacement' }, serial]);
	db.collections.scanner_profiles = replacement;
	reset$.next(replacement);
	expect(values).toEqual([[keyboard], [{ ...keyboard, name: 'Replacement' }]]);
	expect(await readScannerProfiles(db, ['keyboard'])).toEqual([
		{ ...keyboard, name: 'Replacement' },
	]);
	subscription.unsubscribe();
});

it('upserts the registration payload on deviceKey and emits the renamed profile, not a twin', async () => {
	const db = databaseFor(fakeCollection());
	const values: ScannerProfile[][] = [];
	const subscription = observeScannerProfiles(db).subscribe((rows) => values.push(rows));
	await saveScannerProfile(db, keyboard);
	await saveScannerProfile(db, { ...keyboard, name: 'Renamed' });
	expect(db.collections.scanner_profiles.upsert).toHaveBeenNthCalledWith(1, keyboard);
	expect(values).toEqual([[], [keyboard], [{ ...keyboard, name: 'Renamed' }]]);
	expect(await readScannerProfiles(db)).toEqual([{ ...keyboard, name: 'Renamed' }]);
	subscription.unsubscribe();
});

it('removes by deviceKey and returns false for an already removed or unknown row', async () => {
	const db = databaseFor();
	expect(await removeScannerProfile(db, keyboard.deviceKey)).toBe(true);
	expect(await removeScannerProfile(db, keyboard.deviceKey)).toBe(false);
	expect(await removeScannerProfile(db, 'unknown')).toBe(false);
	expect(await readScannerProfiles(db)).toEqual([serial]);
});

it('silently accepts overlapping removals of the same scanner', async () => {
	const db = databaseFor();
	expect(
		await Promise.all([
			removeScannerProfile(db, keyboard.deviceKey),
			removeScannerProfile(db, keyboard.deviceKey),
		])
	).toEqual([true, false]);
});

it('does not swallow a storage failure while the scanner still exists', async () => {
	const db = databaseFor();
	db.collections.scanner_profiles.findOne.mockReturnValueOnce({
		exec: async () => ({
			toJSON: () => keyboard,
			remove: async () => {
				throw new Error('storage failed');
			},
		}),
	});
	await expect(removeScannerProfile(db, keyboard.deviceKey)).rejects.toThrow('storage failed');
	db.collections.scanner_profiles.upsert.mockRejectedValueOnce(new Error('write failed'));
	await expect(saveScannerProfile(db, keyboard)).rejects.toThrow('write failed');
});

it.each([null, undefined])(
	'returns empty reads and rejects writes without a database (%s)',
	async (db) => {
		expect(await firstValueFrom(observeScannerProfiles(db))).toEqual([]);
		expect(await readScannerProfiles(db)).toEqual([]);
		await expect(saveScannerProfile(db, keyboard)).rejects.toBeInstanceOf(
			StoreDatabaseUnavailableError
		);
		await expect(removeScannerProfile(db, keyboard.deviceKey)).rejects.toBeInstanceOf(
			StoreDatabaseUnavailableError
		);
	}
);
