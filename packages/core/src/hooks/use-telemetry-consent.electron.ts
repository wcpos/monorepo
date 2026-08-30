import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';
import { of } from 'rxjs';
import { startWith } from 'rxjs/operators';

import { useAppState } from '@wcpos/core/contexts/app-state';
import { type TypedIpcRenderer } from '@wcpos/printer/ipc-channels';
import { setTelemetryConsent, type TelemetryConsent } from '@wcpos/utils/logger/sentry-sink';

export function useTelemetryConsent(): void {
	const { store } = useAppState();
	// Two different "no store" situations:
	// - Boot, before the session has restored: no opinion (`null`). Sending
	//   'undecided' here would overwrite the desktop shell's persisted answer
	//   on every launch and switch its reporting off exactly while the local
	//   database opens — the moment the storage-corruption class fires.
	// - Logout, after a store was seen: 'undecided', so both clients stop until the
	//   next merchant's preference is known.
	// Adjust state during render — the sanctioned pattern (see useThemeRestorer).
	const [seenStore, setSeenStore] = React.useState(false);
	if (store && !seenStore) setSeenStore(true);
	const consent$ = React.useMemo(
		() =>
			store
				? store.tracking_consent$!.pipe(startWith(store.tracking_consent ?? 'undecided'))
				: of<TelemetryConsent | null>(seenStore ? 'undecided' : null),
		[store, seenStore]
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
