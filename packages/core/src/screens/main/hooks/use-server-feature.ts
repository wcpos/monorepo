import * as React from 'react';

import { useStoreSession } from '../../../contexts/app-state';
import { useRestHttpClient } from './use-rest-http-client';

/**
 * The features each site's plugin advertises (`GET wcpos/v2/status` → `capabilities`), asked once
 * per site for the session and kept in memory only. A failed ask is dropped, so the next mount
 * asks again rather than keeping a transient "no" until the app restarts.
 */
const featuresBySite = new Map<string, Promise<readonly string[]>>();

/**
 * Whether the site's plugin advertises `name`. False until the plugin has answered and on any
 * failure: an older plugin that does not list the name keeps the behaviour it was built for.
 */
export function useServerFeature(name: string): boolean {
	const http = useRestHttpClient();
	const { site } = useStoreSession();
	const siteKey = String(site.uuid);
	const [answer, setAnswer] = React.useState<{ siteKey: string; features: readonly string[] }>();

	React.useEffect(() => {
		let live = true;
		let features = featuresBySite.get(siteKey);
		if (!features) {
			features = http.get('status').then(({ data }) => {
				const listed: unknown = data?.capabilities;
				return Array.isArray(listed) ? listed.filter((item) => typeof item === 'string') : [];
			});
			featuresBySite.set(siteKey, features);
			features.catch(() => featuresBySite.delete(siteKey));
		}
		// The client changes with connectivity: a re-run over the same answer keeps the state.
		features.then(
			(list) =>
				live &&
				setAnswer((prev) =>
					prev?.siteKey === siteKey && prev.features === list ? prev : { siteKey, features: list }
				),
			() => undefined
		);
		return () => {
			live = false;
		};
	}, [http, siteKey]);

	return answer?.siteKey === siteKey && answer.features.includes(name);
}
