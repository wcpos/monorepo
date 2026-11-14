import {
	claimScanOwner,
	createScanConsumerToken,
	isScanOwner,
	releaseScanOwner,
	resetScanOwnersForTests,
	type ScanConsumerToken,
	scanOwner$,
} from './scan-owner';

beforeEach(() => resetScanOwnersForTests());

it('gives the newest consumer ownership and restores the previous owner on release', () => {
	const a = createScanConsumerToken('A');
	const b = createScanConsumerToken('B');
	const owners: (ScanConsumerToken | null)[] = [];
	const subscription = scanOwner$.subscribe((owner) => owners.push(owner));
	claimScanOwner(a);
	expect(isScanOwner(a)).toBe(true);
	claimScanOwner(b);
	expect(isScanOwner(b)).toBe(true);
	expect(isScanOwner(a)).toBe(false);
	releaseScanOwner(b);
	expect(isScanOwner(a)).toBe(true);
	releaseScanOwner(a);
	expect(isScanOwner(a)).toBe(false);
	expect(owners).toEqual([null, a, b, a, null]);
	subscription.unsubscribe();
});

it('moves an existing claim to the end without duplicating it', () => {
	const a = createScanConsumerToken('A');
	const b = createScanConsumerToken('B');
	const owners: (ScanConsumerToken | null)[] = [];
	const subscription = scanOwner$.subscribe((owner) => owners.push(owner));
	claimScanOwner(a);
	claimScanOwner(b);
	claimScanOwner(a);
	expect(isScanOwner(a)).toBe(true);
	expect(isScanOwner(b)).toBe(false);
	releaseScanOwner(a);
	expect(isScanOwner(b)).toBe(true);
	releaseScanOwner(b);
	expect(owners).toEqual([null, a, b, a, b, null]);
	subscription.unsubscribe();
});
