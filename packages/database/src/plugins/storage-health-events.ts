import { BehaviorSubject } from 'rxjs';

export type StorageHealthStatus = 'healthy' | 'degraded';

export interface StorageHealthState {
	status: StorageHealthStatus;
	reason?: string;
	source?: string;
	lastErrorAt?: number;
}

const initialState: StorageHealthState = {
	status: 'healthy',
};

const subject = new BehaviorSubject<StorageHealthState>(initialState);

export const storageHealth$ = subject.asObservable();

export function getStorageHealthSnapshot(): StorageHealthState {
	return subject.getValue();
}

export function markStorageDegraded(source: string, reason: string) {
	subject.next({
		status: 'degraded',
		source,
		reason,
		lastErrorAt: Date.now(),
	});
}

export function markStorageHealthy() {
	subject.next(initialState);
}

export function resetStorageHealth() {
	subject.next(initialState);
}
