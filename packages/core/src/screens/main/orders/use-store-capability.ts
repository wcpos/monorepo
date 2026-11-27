import * as React from 'react';

import { useOnlineStatus } from '@wcpos/hooks/use-online-status';

import { useStoreSession } from '../../../contexts/app-state';
import { useRestHttpClient } from '../hooks/use-rest-http-client';

/**
 * `GET wcpos/v2/status` → `capabilities`, once per store session (`site uuid:store id`). An
 * answer is kept for the session, a 404 (a plugin with no such route) as an empty list; a
 * transport or server failure is dropped, so the next mount online asks again.
 */
const answers = new Map<string, Promise<readonly string[]>>();

function readCapabilities(http: ReturnType<typeof useRestHttpClient>, key: string) {
	let request = answers.get(key);
	if (request) return request;
	request = http.get('status').then(
		(response: { data?: { capabilities?: unknown } } | undefined) => {
			const list = response?.data?.capabilities;
			return Array.isArray(list) ? list.filter((item) => typeof item === 'string') : [];
		},
		(error: { response?: { status?: number } } | undefined) => {
			if (error?.response?.status === 404) return [];
			answers.delete(key);
			throw error;
		}
	);
	answers.set(key, request);
	return request;
}

/** Whether the store advertises `name`. Fails closed: offline, unknown yet, or any error. */
export function useStoreCapability(name: string): boolean {
	const http = useRestHttpClient();
	const online = useOnlineStatus().status === 'online-website-available';
	const { site, store } = useStoreSession();
	const key = `${site.uuid}:${store.id}`;
	const [known, setKnown] = React.useState<{ key: string; list: readonly string[] } | null>(null);
	// Ask the store only while online; `live` drops an answer that lands after unmount or after
	// the session moved to another store, so a stale list never unlocks an action.
	React.useEffect(() => {
		if (!online) return;
		let live = true;
		readCapabilities(http, key).then(
			(list) => live && setKnown({ key, list }),
			() => live && setKnown(null)
		);
		return () => {
			live = false;
		};
	}, [http, key, online]);
	return online && known?.key === key && known.list.includes(name);
}
