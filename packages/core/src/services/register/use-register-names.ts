import * as React from 'react';

import { useStoreSession } from '../../contexts/app-state';
import { useRestHttpClient } from '../../screens/main/hooks/use-rest-http-client';
import { getRegisterSnapshot } from './register-document';
import { useRegister } from './use-register';

type Directory = {
	names: Record<string, string>;
	request?: Promise<void>;
	listeners: Set<() => void>;
};
const directories = new Map<string, Directory>();

/** One directory request per (site, store) per app session; local identity never waits for the network. */
export function useRegisterNames(): Record<string, string> {
	const http = useRestHttpClient();
	const { site, store } = useStoreSession();
	const key = `${site.uuid}:${store.id}`;
	if (!directories.has(key)) directories.set(key, { names: {}, listeners: new Set() });
	const entry = directories.get(key)!;
	const getSnapshot = React.useCallback(() => entry.names, [entry]);
	const register = useRegister() ?? getRegisterSnapshot();
	const subscribe = React.useCallback(
		(listener: () => void) => {
			entry.listeners.add(listener);
			entry.request ??= Promise.resolve()
				.then(() => http.get('registers'))
				.then((response) =>
					Object.fromEntries(
						(response.data as { id: string; name: string }[]).map(({ id, name }) => [id, name])
					)
				)
				.catch(() => ({}))
				.then((value) => {
					entry.names = value;
					entry.listeners.forEach((notify) => notify());
				});
			return () => {
				entry.listeners.delete(listener);
			};
		},
		[http, entry]
	);
	const directory = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
	return React.useMemo(
		() => (register ? { ...directory, [register.id]: register.name } : directory),
		[directory, register]
	);
}
