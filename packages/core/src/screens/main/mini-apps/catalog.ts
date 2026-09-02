import * as React from 'react';

import { AppInfo } from '@wcpos/utils/app-info';

import seed from './catalog.seed.json';

// The path carries the mini-app protocol major only; patch content can update in place.
export const MINI_APP_ORIGIN = 'https://cdn.jsdelivr.net/gh/wcpos/mini-apps@1';
export const CATALOG_URL = `${MINI_APP_ORIGIN}/catalog.json`;
export const ALLOWED_MINI_APP_IDS = ['printer-wizard'] as const;
const FETCH_TIMEOUT_MS = 5_000;

export interface MiniAppCatalogEntry {
	id: string;
	title: Record<string, string>;
	url: string;
	capabilities: string[];
	minAppVersion: string;
	entry: string[];
	platforms: ('ios' | 'android' | 'web' | 'electron')[];
}

const bundledEntries = seed.miniApps as MiniAppCatalogEntry[];
let catalogPromise: Promise<MiniAppCatalogEntry[]> | undefined;

function loadCatalog(): Promise<MiniAppCatalogEntry[]> {
	if (catalogPromise) return catalogPromise;
	catalogPromise = (async () => {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
		try {
			const response = await fetch(CATALOG_URL, { signal: controller.signal });
			if (!response.ok) throw new Error(`Catalog returned ${response.status}`);
			const catalog = (await response.json()) as { wcpos?: unknown; miniApps?: unknown };
			if (catalog.wcpos !== 1 || !Array.isArray(catalog.miniApps)) return bundledEntries;
			return (catalog.miniApps as MiniAppCatalogEntry[]).filter((entry) =>
				(ALLOWED_MINI_APP_IDS as readonly string[]).includes(entry.id)
			);
		} catch {
			return bundledEntries;
		} finally {
			clearTimeout(timer);
		}
	})();
	return catalogPromise;
}

export function useMiniAppCatalog(): MiniAppCatalogEntry[] {
	const [entries, setEntries] = React.useState(bundledEntries);
	// External catalog fetch: seed is rendered immediately, then this single session request may replace it.
	React.useEffect(() => {
		void loadCatalog().then(setEntries);
	}, []);
	return entries;
}

export function usePrinterWizardAvailable(entry: string): boolean {
	return useMiniAppCatalog().some(
		(item) =>
			item.id === 'printer-wizard' &&
			item.entry.includes(entry) &&
			item.platforms.includes(AppInfo.platform)
	);
}

/** Test-only reset for the intentional module-level app-session cache. */
export function resetCatalogCacheForTests(): void {
	catalogPromise = undefined;
}
