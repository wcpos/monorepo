import * as React from 'react';

import { useOnlineStatus } from '@wcpos/hooks/use-online-status';

import { useStoreSession } from '../../contexts/app-state';
import { useRestHttpClient } from '../../screens/main/hooks/use-rest-http-client';
import {
	adoptCounters,
	bindRegister,
	getBoundRegisterId,
	getRegisterSnapshot,
	readBoundRegister,
	type RegisterCounters,
	unbindRegister,
} from './register-document';

type Register = {
	id: string;
	name: string;
	status: string;
	default_float?: string | null;
	counters?: RegisterCounters;
};
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
		const pointer = getBoundRegisterId(siteUuid, storeId)
			? getRegisterSnapshot()?.sites?.[siteUuid]
			: null;
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
/** One directory request per (site, store) per app session, shared by every reader. */
function loadDirectory(
	entry: Directory,
	http: Pick<ReturnType<typeof useRestHttpClient>, 'get'>,
	storeId: number | undefined
): Promise<void> {
	entry.request ??= http
		.get('registers', storeId && storeId > 0 ? { params: { store_id: storeId } } : undefined)
		.then((response) => {
			entry.loaded = true;
			publish(entry, {
				registers: (response.data as Register[]).filter((row) => row.status === 'active'),
			});
		})
		.catch(() => {
			// A failed list request leaves the pointer and status unchanged; the next
			// session (or reconnect) tries again.
			entry.request = undefined;
		});
	return entry.request;
}

export function useRegisterBindingSession(): void {
	const { userDB, site, store } = useStoreSession();
	const http = useRestHttpClient();
	const online = useOnlineStatus().status === 'online-website-available';
	const entry = directory(site.uuid!, store.id);
	// Synchronize the persisted pointer and the external register directory on session/connectivity changes.
	React.useEffect(() => {
		const load = async () => {
			const bound = await readBoundRegister(userDB, site.uuid!, store.id);
			publish(entry, {
				status: bound ? 'bound' : 'unknown',
				registerId: bound?.id ?? null,
				registerName: bound?.name ?? null,
			});
			if (!online) return;
			await loadDirectory(entry, http, store.id);
			if (!entry.loaded) return;
			const registers = entry.value.registers;
			if (bound && registers.some(({ id }) => id === bound.id)) {
				const row = (await http.get(`registers/${bound.id}`)).data as Register;
				if (row.counters) await adoptCounters(userDB, site.uuid!, row.id, row.counters);
				return;
			}
			if (registers.length === 1) {
				const row = (await http.get(`registers/${registers[0].id}`)).data as Register;
				if (row.counters) await adoptCounters(userDB, site.uuid!, row.id, row.counters);
				await bindRegister(userDB, site.uuid!, registers[0], store.id);
				publish(entry, {
					status: 'bound',
					registerId: registers[0].id,
					registerName: registers[0].name,
				});
			} else {
				if (bound) await unbindRegister(userDB, site.uuid!, store.id);
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
	const http = useRestHttpClient();
	const online = useOnlineStatus().status === 'online-website-available';
	const entry = directory(site.uuid!, store.id);
	// A reader mounted before (or without) the session hook still gets the directory.
	React.useEffect(() => {
		if (online && !entry.loaded) void loadDirectory(entry, http, store.id);
	}, [entry, http, online, store.id]);
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
			const row = (await http.get(`registers/${id}`)).data as Register;
			if (row.counters) await adoptCounters(userDB, site.uuid!, row.id, row.counters);
			await bindRegister(userDB, site.uuid!, register, store.id);
			publish(entry, { status: 'bound', registerId: id, registerName: register.name });
		},
		[entry, http, site.uuid, store.id, userDB]
	);
	return { ...value, bind };
}
