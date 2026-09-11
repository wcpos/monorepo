import * as React from 'react';

import { useOnlineStatus } from '@wcpos/hooks/use-online-status';

import { useStoreSession } from '../../contexts/app-state';
import { useRestHttpClient } from '../../screens/main/hooks/use-rest-http-client';
import {
	bindRegister,
	getRegisterSnapshot,
	readBoundRegister,
	unbindRegister,
} from './register-document';

type Register = { id: string; name: string; status: string };
type Binding = {
	status: 'bound' | 'choose' | 'none' | 'unknown';
	registerId: string | null;
	registerName: string | null;
	registers: Register[];
};
type Directory = {
	value: Binding;
	request?: Promise<void>;
	loaded: boolean;
	listeners: Set<() => void>;
};
const directories = new Map<string, Directory>();

function directory(siteUuid: string, storeId: number | undefined): Directory {
	const key = `${siteUuid}:${storeId}`;
	if (!directories.has(key)) {
		const pointer = getRegisterSnapshot()?.sites[siteUuid];
		directories.set(key, {
			loaded: false,
			listeners: new Set(),
			value: {
				status: pointer?.register_id ? 'bound' : 'unknown',
				registerId: pointer?.register_id ?? null,
				registerName: pointer?.register_name ?? null,
				registers: [],
			},
		});
	}
	return directories.get(key)!;
}

function publish(entry: Directory, changes: Partial<Binding>) {
	entry.value = { ...entry.value, ...changes };
	entry.listeners.forEach((notify) => notify());
}

/** Mounted once at the store-session bridge. Readers share this one site:store directory. */
export function useRegisterBindingSession(): void {
	const { userDB, site, store } = useStoreSession();
	const http = useRestHttpClient();
	const online = useOnlineStatus().status === 'online-website-available';
	const entry = directory(site.uuid!, store.id);
	// Synchronize the persisted pointer and the external register directory on session/connectivity changes.
	React.useEffect(() => {
		const load = async () => {
			const bound = await readBoundRegister(userDB, site.uuid!);
			publish(entry, {
				status: bound ? 'bound' : 'unknown',
				registerId: bound?.id ?? null,
				registerName: bound?.name ?? null,
			});
			if (!online) return;
			entry.request ??= http
				.get('registers', store.id && store.id > 0 ? { params: { store_id: store.id } } : undefined)
				.then((response) => {
					entry.loaded = true;
					publish(entry, {
						registers: (response.data as Register[]).filter((row) => row.status === 'active'),
					});
				});
			await entry.request;
			if (!entry.loaded) return;
			const registers = entry.value.registers;
			if (bound && registers.some(({ id }) => id === bound.id)) return;
			if (registers.length === 1) {
				await bindRegister(userDB, site.uuid!, registers[0]);
				publish(entry, {
					status: 'bound',
					registerId: registers[0].id,
					registerName: registers[0].name,
				});
			} else {
				if (bound) await unbindRegister(userDB, site.uuid!);
				publish(entry, {
					status: registers.length ? 'choose' : 'none',
					registerId: null,
					registerName: null,
				});
			}
		};
		// A failed list request leaves the pointer/status unchanged; no retries.
		void load().catch(() => {});
	}, [entry, http, online, site.uuid, store.id, userDB]);
}

export function useRegisterBinding() {
	const { userDB, site, store } = useStoreSession();
	const entry = directory(site.uuid!, store.id);
	const subscribe = React.useCallback(
		(notify: () => void) => {
			entry.listeners.add(notify);
			return () => {
				entry.listeners.delete(notify);
			};
		},
		[entry]
	);
	const snapshot = React.useCallback(() => entry.value, [entry]);
	const value = React.useSyncExternalStore(subscribe, snapshot, snapshot);
	const bind = React.useCallback(
		async (id: string) => {
			const register = entry.value.registers.find((row) => row.id === id);
			if (!register) return;
			await bindRegister(userDB, site.uuid!, register);
			publish(entry, { status: 'bound', registerId: id, registerName: register.name });
		},
		[entry, site.uuid, userDB]
	);
	return { ...value, bind };
}
