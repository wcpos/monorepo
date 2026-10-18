import * as React from 'react';

import {
	measureStorageFootprint,
	type StorageFootprintSummary,
	useQueryRuntime,
} from '@wcpos/query';

import { useAppState } from '../../../contexts/app-state';
import { useEngineStatus } from '../hooks/use-engine-monitor';
/**
 * Measure and classify every byte of app storage on this device. One-shot per
 * scope (matching the old other-scopes probe): storage moves slowly and the
 * screen re-mounts on every visit. Null while measuring or where no platform
 * measurement exists — the UI hides its storage lines rather than showing a
 * zero it cannot back up.
 */
export function useStorageFootprint(): StorageFootprintSummary | null {
	const runtime = useQueryRuntime();
	const { userDB, storeDB } = useAppState();
	// One engine hosts multiple scopes: a same-site store switch changes
	// `activeScopeId` without changing the engine's identity, so the probe
	// must key on the scope, not just the engine.
	const { activeScopeId } = useEngineStatus();
	const [measurement, setMeasurement] = React.useState<{
		scopeId: typeof activeScopeId;
		summary: StorageFootprintSummary;
	} | null>(null);

	// Effect (last resort per project.mdc): storage enumeration is a one-shot
	// async platform probe with no reactive seam.
	React.useEffect(() => {
		let cancelled = false;
		void (async () => {
			const summary = await measureStorageFootprint(runtime.engine, userDB, storeDB?.name ?? null);
			if (summary !== null && !cancelled) {
				setMeasurement({ scopeId: activeScopeId, summary });
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [runtime.engine, activeScopeId, userDB, storeDB]);

	return measurement?.scopeId === activeScopeId ? measurement.summary : null;
}
