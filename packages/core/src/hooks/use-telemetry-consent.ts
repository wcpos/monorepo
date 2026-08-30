import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';
import { of } from 'rxjs';
import { startWith } from 'rxjs/operators';

import { useAppState } from '@wcpos/core/contexts/app-state';
import { setTelemetryConsent, type TelemetryConsent } from '@wcpos/utils/logger/sentry-sink';

export function useTelemetryConsent(): void {
	const { store } = useAppState();
	// No store document, no opinion: `null` until the store has loaded, so a
	// boot-time 'undecided' can never overwrite the merchant's stored answer.
	const consent$ = React.useMemo(
		() =>
			store
				? store.tracking_consent$!.pipe(startWith(store.tracking_consent ?? 'undecided'))
				: of<TelemetryConsent | null>(null),
		[store]
	);
	const consent = useObservableEagerState(consent$);

	// Synchronize the reactive merchant preference with the external telemetry client.
	React.useEffect(() => {
		if (consent) setTelemetryConsent(consent);
	}, [consent]);
}
