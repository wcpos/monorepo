import { BehaviorSubject } from 'rxjs';

import { observeCoverage, readCoverageGeneration } from '@wcpos/query';
import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import type { RatesReady } from './settlement-coordinator';

// Per engine, not per mount: compaction drops the lane and a remount never sees `complete` again.
const ratesLanded = new WeakMap<RxdbSyncEngine, number>();

/**
 * Whether the coordinator may settle against the tax rates: the rates generation has landed
 * (its coverage said complete once) and the database read has answered (#3186).
 */
export function ratesReady(engine: RxdbSyncEngine) {
	const ready$ = new BehaviorSubject<RatesReady>({ ready: false, generation: 0 });
	const coverage$ = observeCoverage(engine, { collection: 'taxRates', lane: 'reference' });
	const shut = () => ready$.next({ ...ready$.value, ready: false });
	return {
		ready$: ready$.asObservable(),
		coverage$,
		/** A committed render's verdict, published beside the config inputs it was read with. */
		publish(complete: boolean, generation: number, ratesRead: boolean) {
			if (complete) ratesLanded.set(engine, generation);
			ready$.next({ ready: ratesRead && ratesLanded.get(engine) === generation, generation });
		},
		/** Shuts on a database rebind, and on an incomplete verdict in a generation not landed. */
		watch() {
			const offEvents = engine.events((event) => {
				if (event.type === 'scope-switched' || event.type === 'collection-reset') shut();
			});
			const coverage = coverage$.subscribe((value) => {
				if (
					!value.complete &&
					ratesLanded.get(engine) !== readCoverageGeneration(engine, 'taxRates')
				)
					shut();
			});
			return () => {
				offEvents();
				coverage.unsubscribe();
			};
		},
	};
}
