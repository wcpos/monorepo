import { type Observable, Subject } from 'rxjs';

export type PermissionsSignal = { kind: 'stamp'; stamp: string } | { kind: 'refused' };

const signals = new Subject<PermissionsSignal>();
export const permissionsSignal$: Observable<PermissionsSignal> = signals.asObservable();

export function reportPermissionsSignal(signal: PermissionsSignal): void {
	if (signal.kind === 'stamp' && !/^[0-9a-f]{16}$/.test(signal.stamp)) return;
	signals.next(signal);
}
