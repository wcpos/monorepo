import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';
import { of } from 'rxjs';
import { startWith } from 'rxjs/operators';

import { useAppState } from '@wcpos/core/contexts/app-state';
import { setTelemetryConsent, type TelemetryConsent } from '@wcpos/utils/logger/sentry-sink';

export function useTelemetryConsent(): void {
	const { store } = useAppState();
	// Without a store, reset the external client until a merchant preference is available.
	const consent$ = React.useMemo(
		() =>
			store
				? store.tracking_consent$!.pipe(startWith(store.tracking_consent ?? 'undecided'))
				: of<TelemetryConsent>('undecided'),
		[store]
	);
	const consent = useObservableEagerState(consent$);

	// Synchronize the reactive merchant preference with the external telemetry client.
	React.useEffect(() => {
		if (consent) setTelemetryConsent(consent);
	}, [consent]);
}
