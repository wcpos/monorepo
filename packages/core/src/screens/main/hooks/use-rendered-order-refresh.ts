import * as React from 'react';
import { AppState } from 'react-native';

import { useIsFocused } from 'expo-router';
import { distinctUntilChanged, type Observable, skip } from 'rxjs';

import { type EngineRecord, requireRenderedOrders, useQueryRuntime } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';

import { manualSyncInFlight$ } from '../health/manual-sync-in-flight';

// Re-read visible orders once a minute while the screen and app are active.
const RENDERED_ORDER_REFRESH_MS = 60_000;
const logger = getLogger(['wcpos', 'orders', 'rendered-refresh']);

export function useRenderedOrderRefresh(
	results$: Observable<{ hits: { record?: Pick<EngineRecord<'orders'>, 'remoteId'> }[] }>
): void {
	const runtime = useQueryRuntime();
	const focused = useIsFocused();
	const [appState, setAppState] = React.useState(AppState.currentState);
	const ids = React.useRef<NonNullable<EngineRecord<'orders'>['remoteId']>[]>([]);
	const inFlight = React.useRef<ReturnType<typeof requireRenderedOrders> | null>(null);
	const active = focused && appState === 'active';

	// Subscribe without rendering: each pass reads the latest rows, not a queued snapshot.
	React.useEffect(() => {
		ids.current = [];
		const subscription = results$.subscribe(({ hits }) => {
			const distinct = new Set<NonNullable<EngineRecord<'orders'>['remoteId']>>();
			for (const { record } of hits) {
				if (record?.remoteId != null) distinct.add(record.remoteId);
				if (distinct.size === 100) break;
			}
			ids.current = [...distinct];
		});
		return () => subscription.unsubscribe();
	}, [results$]);

	// AppState is an external lifecycle signal; unmount also releases outstanding demand.
	React.useEffect(() => {
		const subscription = AppState.addEventListener('change', setAppState);
		return () => {
			subscription.remove();
			inFlight.current?.release();
			inFlight.current = null;
		};
	}, []);

	// The focus/foreground gate owns the timer and manual-sync subscription.
	React.useEffect(() => {
		if (!active) return;
		const pass = () => {
			if (inFlight.current || ids.current.length === 0) return;
			const handle = requireRenderedOrders(runtime.engine, ids.current);
			inFlight.current = handle;
			void handle.ready
				.catch(() => {
					logger.debug('Rendered order refresh failed');
				})
				.finally(() => {
					if (inFlight.current !== handle) return;
					handle.release();
					inFlight.current = null;
				});
		};
		pass();
		const timer = setInterval(pass, RENDERED_ORDER_REFRESH_MS);
		const subscription = manualSyncInFlight$
			.pipe(distinctUntilChanged(), skip(1))
			.subscribe((syncing) => {
				if (syncing) pass();
			});
		return () => {
			clearInterval(timer);
			subscription.unsubscribe();
		};
	}, [active, runtime.engine]);
}
