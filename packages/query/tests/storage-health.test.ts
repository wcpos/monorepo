import {
	clearStorageDegradation,
	reportStorageWorkerLost,
} from '@wcpos/database/plugins/wrapped-error-handler-storage';

import { isStorageDegraded, observeStorageDegraded } from '../src/storage-health';

afterEach(() => clearStorageDegradation());

it('synchronously emits the current latch and follows changes from the same storage singleton', () => {
	const values: boolean[] = [];
	const subscription = observeStorageDegraded().subscribe((value) => values.push(value));
	expect(values).toEqual([false]);
	reportStorageWorkerLost('store', 'worker gone');
	expect(values).toEqual([false, true]);
	expect(isStorageDegraded()).toBe(true);
	const lateValues: boolean[] = [];
	const late = observeStorageDegraded().subscribe((value) => lateValues.push(value));
	expect(lateValues).toEqual([true]);
	clearStorageDegradation();
	expect(values).toEqual([false, true, false]);
	expect(isStorageDegraded()).toBe(false);
	subscription.unsubscribe();
	late.unsubscribe();
});
