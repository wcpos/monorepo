import * as React from 'react';

import { useRestHttpClient } from '../../screens/main/hooks/use-rest-http-client';
import { getRegisterSnapshot } from './register-document';
import { useRegister } from './use-register';

let names: Record<string, string> = {};
let request: Promise<void> | undefined;
const listeners = new Set<() => void>();
const getSnapshot = () => names;

/** One directory request per app session; local identity never waits for the network. */
export function useRegisterNames(): Record<string, string> {
	const http = useRestHttpClient();
	const register = useRegister() ?? getRegisterSnapshot();
	const subscribe = React.useCallback(
		(listener: () => void) => {
			listeners.add(listener);
			request ??= Promise.resolve()
				.then(() => http.get('registers'))
				.then((response) =>
					Object.fromEntries(
						(response.data as { id: string; name: string }[]).map(({ id, name }) => [id, name])
					)
				)
				.catch(() => ({}))
				.then((value) => {
					names = value;
					listeners.forEach((notify) => notify());
				});
			return () => {
				listeners.delete(listener);
			};
		},
		[http]
	);
	const directory = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
	return React.useMemo(
		() => (register ? { ...directory, [register.id]: register.name } : directory),
		[directory, register]
	);
}
