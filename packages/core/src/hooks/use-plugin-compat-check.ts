import * as React from 'react';

import type { SiteDocument } from '@wcpos/database';
import { useHttpClient } from '@wcpos/hooks/use-http-client';
import { useDocField } from '@wcpos/query';
import { type ReadonlySiteRecord, recordSiteInfo } from '@wcpos/query/user-db';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { fetchLiveSiteInfo } from '../utils/fetch-live-site-info';
import {
	isWcposPluginCompatible,
	MINIMUM_WCPOS_PLUGIN_VERSION,
} from '../utils/wcpos-plugin-version';

const compatLogger = getLogger(['wcpos', 'app', 'compat']);

export type PluginCompatStatus = 'ok' | 'checking' | 'outdated';

const versionOf = (value: unknown) => (typeof value === 'string' && value ? value : null);

/**
 * Whether the store's WCPOS plugin is new enough for this app. A saved version that passes (or
 * no saved version at all) is trusted as is. A failing one is never trusted alone: the store is
 * asked again with a cache-busted, unauthenticated request before the gate is allowed to stand,
 * because a cached 1.x index answer once held a 2.0.1 store behind the gate (AUTH331).
 */
export function usePluginCompatCheck(site: ReadonlySiteRecord | SiteDocument | null | undefined): {
	status: PluginCompatStatus;
	recheck: () => void;
} {
	const http = useHttpClient();
	const record = site as ReadonlySiteRecord | null | undefined;
	const savedVersion = useDocField(record, (value) => value.wcpos_version);
	const savedProVersion = useDocField(record, (value) => value.wcpos_pro_version);
	const savedPasses = !savedVersion || isWcposPluginCompatible(savedVersion || savedProVersion);
	const [phase, setPhase] = React.useState<PluginCompatStatus>('checking');

	// A check reads what is current when it starts; declared first, so it is fresh for the trigger.
	const latest = React.useRef({ http, site, savedVersion, savedProVersion });
	React.useEffect(() => {
		latest.current = { http, site, savedVersion, savedProVersion };
	});
	const inFlight = React.useRef(false);
	const mounted = React.useRef(false);
	React.useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);

	const recheck = React.useCallback(() => {
		if (inFlight.current) return;
		inFlight.current = true;
		setPhase('checking');
		const run = async () => {
			const { http: client, site: target, ...saved } = latest.current;
			const versions = {
				savedVersion: versionOf(saved.savedVersion),
				savedProVersion: versionOf(saved.savedProVersion),
			};
			let data: Record<string, unknown> | null = null;
			try {
				data = target?.wp_api_url ? await fetchLiveSiteInfo(client, target.wp_api_url) : null;
			} catch {
				data = null;
			}
			if (!mounted.current) return;
			const live = {
				liveVersion: versionOf(data?.wcpos_version),
				liveProVersion: versionOf(data?.wcpos_pro_version),
			};
			if (target && data && (live.liveVersion || live.liveProVersion)) {
				try {
					await recordSiteInfo(target, data);
				} catch (error) {
					if (!mounted.current) return;
					compatLogger.warn('Could not save the WCPOS plugin version the store reported', {
						context: { ...versions, ...live, error: getErrorMessage(error) },
					});
				}
			}
			if (!mounted.current) return;
			if (isWcposPluginCompatible(live.liveVersion || live.liveProVersion || undefined)) {
				compatLogger.warn(
					'Saved WCPOS plugin version was stale; the store reports a supported version',
					{
						code: ERROR_CODES.WCPOS_PLUGIN_OUTDATED,
						context: { ...versions, ...live },
					}
				);
				setPhase('ok');
				return;
			}
			compatLogger.error('Store WCPOS plugin is older than this app requires', {
				code: ERROR_CODES.WCPOS_PLUGIN_OUTDATED,
				context: {
					...versions,
					...live,
					liveCheck: data ? 'ok' : 'failed',
					minimumVersion: MINIMUM_WCPOS_PLUGIN_VERSION,
				},
			});
			setPhase('outdated');
		};
		void run().finally(() => {
			inFlight.current = false;
		});
	}, []);

	// On mount, and whenever the saved version turns from passing to failing; never on re-render.
	React.useEffect(() => {
		if (!savedPasses) recheck();
	}, [savedPasses, recheck]);

	return { status: savedPasses || phase === 'ok' ? 'ok' : phase, recheck };
}
