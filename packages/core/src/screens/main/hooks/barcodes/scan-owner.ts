import { BehaviorSubject } from 'rxjs';

export type ScanConsumerToken = symbol;
const owners: ScanConsumerToken[] = [];
const owner$ = new BehaviorSubject<ScanConsumerToken | null>(null);

export const createScanConsumerToken = (label = 'scan-consumer'): ScanConsumerToken =>
	Symbol(label);

export function claimScanOwner(token: ScanConsumerToken): void {
	const index = owners.indexOf(token);
	if (index !== -1) owners.splice(index, 1);
	owners.push(token);
	owner$.next(token);
}

export function releaseScanOwner(token: ScanConsumerToken): void {
	const index = owners.indexOf(token);
	if (index !== -1) owners.splice(index, 1);
	owner$.next(owners[owners.length - 1] ?? null);
}

export const isScanOwner = (token: ScanConsumerToken) => owners[owners.length - 1] === token;
export const scanOwner$ = owner$.asObservable();

export function resetScanOwnersForTests(): void {
	owners.length = 0;
	owner$.next(null);
}
