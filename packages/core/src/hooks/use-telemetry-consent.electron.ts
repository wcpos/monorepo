import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';
import { of } from 'rxjs';
import { startWith } from 'rxjs/operators';

import { useAppState } from '@wcpos/core/contexts/app-state';
import { type TypedIpcRenderer } from '@wcpos/printer/ipc-channels';
import { setTelemetryConsent, type TelemetryConsent } from '@wcpos/utils/logger/sentry-sink';

export function useTelemetryConsent(): void {
	const { store } = useAppState();
	// Without a store, reset both telemetry clients until a merchant preference is available.
	const consent$ = React.useMemo(
		() =>
			store
				? store.tracking_consent$!.pipe(startWith(store.tracking_consent ?? 'undecided'))
				: of<TelemetryConsent>('undecided'),
		[store]
	);
	const consent = useObservableEagerState(consent$);

	// Synchronize the reactive merchant preference with both telemetry processes.
	React.useEffect(() => {
		if (!consent) return;
		setTelemetryConsent(consent);
		const ipcRenderer =
			typeof window === 'undefined'
				? undefined
				: (window as unknown as { ipcRenderer?: Pick<TypedIpcRenderer, 'send'> }).ipcRenderer;
		if (ipcRenderer) ipcRenderer.send('telemetry-consent', consent);
	}, [consent]);
}
