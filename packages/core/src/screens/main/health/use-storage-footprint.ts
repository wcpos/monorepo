import * as React from 'react';

import { measureAppStorage } from '@wcpos/database';
import { useQueryRuntime } from '@wcpos/query';
import { siteHashFor } from '@wcpos/sync-core';

import { useAppState } from '../../../contexts/app-state';
import { useEngineStatus } from '../hooks/use-engine-monitor';
import {
	classifyStorageEntries,
	type StorageBreakdown,
	unattributedBytes,
} from './storage-footprint-logic';

export type StorageFootprintSummary = {
	breakdown: StorageBreakdown;
	/** Device-quota view where the platform has one (web), else null. */
	estimateBytes: number | null;
	/** The headline number: the estimate when present (it sees more), else the measured sum. */
	totalBytes: number;
	/** Estimate minus measured (web) plus anything measured-but-unnamed. */
	unattributedBytes: number;
};

/**
 * Measure and classify every byte of app storage on this device. One-shot per
 * scope (matching the old other-scopes probe): storage moves slowly and the
 * screen re-mounts on every visit. Null while measuring or where no platform
 * measurement exists — the UI hides its storage lines rather than showing a
 * zero it cannot back up.
 */
export function useStorageFootprint(): StorageFootprintSummary | null {
	const { engine } = useQueryRuntime();
	const { userDB, storeDB, fastStoreDB } = useAppState();
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
			const footprint = await measureAppStorage();
			if (footprint === null || cancelled) return;

			let activeScopeDbName: string | null = null;
			try {
				const scope = engine.active() ?? (await engine.ready);
				activeScopeDbName = scope.database.name;
			} catch {
				// Engine disposed mid-probe — classify without an active scope.
			}

			const knownSiteHashes = new Set<string>();
			try {
				const sites = await userDB.sites.find().exec();
				for (const site of sites) {
					try {
						knownSiteHashes.add(siteHashFor(site.wp_api_url));
					} catch {
						// A site row without a usable url cannot own scope data.
					}
				}
			} catch {
				// Unknown sites collapse "signed-out stores" into "other stores" —
				// wrong bucket, never a hidden byte.
			}

			const breakdown = classifyStorageEntries(footprint.entries, {
				activeScopeDbName,
				storeDbName: storeDB?.name ?? null,
				fastStoreDbName: fastStoreDB?.name ?? null,
				userDbName: userDB?.name ?? null,
				knownSiteHashes,
			});
			const estimateRemainder = unattributedBytes(
				footprint.estimateBytes,
				breakdown.measuredTotalBytes
			);
			if (!cancelled) {
				setMeasurement({
					scopeId: activeScopeId,
					summary: {
						breakdown,
						estimateBytes: footprint.estimateBytes,
						totalBytes: Math.max(footprint.estimateBytes ?? 0, breakdown.measuredTotalBytes),
						unattributedBytes: (estimateRemainder ?? 0) + breakdown.unknownBytes,
					},
				});
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [engine, activeScopeId, userDB, storeDB, fastStoreDB]);

	return measurement?.scopeId === activeScopeId ? measurement.summary : null;
}
