import * as React from 'react';

import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import {
	adoptCounters,
	bindRegister,
	getBoundRegister,
	readBoundRegister,
	readCounters,
	recordLiveSession,
	type RegisterCounters,
	unbindRegister,
} from '@wcpos/query/register-session';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';

import { recordRegisterFact, useRegisterActor } from '../register-session/audit';
import { useStoreSession } from '../../contexts/app-state';
import { useRestHttpClient } from '../../screens/main/hooks/use-rest-http-client';

export type Register = {
	id: string;
	name: string;
	store_id?: number | null;
	default_float?: string | null;
	counters?: RegisterCounters;
	session?: {
		id: string;
		status: 'open' | 'counting';
		opened_at_gmt: string;
		opened_by: { id: number; name: string };
	} | null;
	last_closure?: { number: number; closed_at_gmt: string | null } | null;
};
type Binding = {
	status: 'bound' | 'choose' | 'none' | 'unknown';
	registerId: string | null;
	registerName: string | null;
	registers: Register[];
	/** The register list has been read from the server (names can be trusted). */
	loaded: boolean;
	/** The last list request failed; nothing more will arrive until the next attempt. */
	failed: boolean;
	/**
	 * A `retry()` is in flight, carrying the state it retries: the sync republishes `unknown` and
	 * clears `failed` before the answer, so the gate card and the pill read this instead.
	 */
	retrying: false | 'none' | 'failed';
};
type Directory = {
	value: Binding;
	request?: Promise<void>;
	/** The `retry()` in flight, so a second tap joins it instead of binding twice. */
	retry?: Promise<void>;
	refresh?: Promise<void>;
	loaded: boolean;
	listeners: Set<() => void>;
	/**
	 * Where a fresh list writes each register's live session. Set by the session hook (the store
	 * session is one database per cashier); a reader that loads before it writes nothing, and
	 * the readers' effect never depends on the database handle, which a session re-render may
	 * hand over as a new object.
	 */
	cache?: { userDB: Parameters<typeof recordLiveSession>[0]; siteUuid: string };
};
const directories = new Map<string, Directory>();

function directory(siteUuid: string, storeId: number | undefined): Directory {
	const key = `${siteUuid}:${storeId}`;
	if (!directories.has(key)) {
		const pointer = getBoundRegister(siteUuid, storeId);
		directories.set(key, {
			loaded: false,
			listeners: new Set(),
			value: {
				status: pointer?.id ? 'bound' : 'unknown',
				registerId: pointer?.id ?? null,
				registerName: pointer?.name ?? null,
				registers: [],
				loaded: false,
				failed: false,
				retrying: false,
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
/** Cached directory request per (site, store), shared by readers until explicitly refreshed. */
function loadDirectory(
	entry: Directory,
	http: Pick<ReturnType<typeof useRestHttpClient>, 'get'>,
	storeId: number | undefined
): Promise<void> {
	if (entry.request) return entry.request;
	// A new attempt clears the last failure: readers wait for names again while it runs.
	if (entry.value.failed) publish(entry, { failed: false });
	// A refresh drops `entry.request` while this one may still be pending: a superseded answer
	// is ignored, so an older list never replaces the refreshed rows and live state.
	const request: Promise<void> = http
		.get('registers', { params: { store_id: storeId || null } })
		.then(async (response) => {
			if (entry.request !== request) return;
			entry.loaded = true;
			publish(entry, {
				loaded: true,
				failed: false,
				// The list holds live registers only (a retired one leaves it and keeps its name for
				// history on the plugin side), so there is no status to filter on; the one-register
				// Free model dropped the column (woocommerce-pos#2350) and a stale `status === 'active'`
				// filter here read every store as having no register.
				registers: (response.data as Register[]).filter((row) => storeId !== 0 || !row.store_id),
			});
			const cache = entry.cache;
			if (!cache) return;
			for (const row of response.data as Register[]) {
				if (entry.request !== request) return;
				await recordLiveSession(
					cache.userDB,
					cache.siteUuid,
					row.id,
					row.session
						? {
								session_id: row.session.id,
								status: row.session.status,
								opened_at_gmt: row.session.opened_at_gmt,
								opened_by: row.session.opened_by,
								acknowledged: true,
								expected_float: null,
								counted_float: null,
								business_day: null,
							}
						: null
				);
			}
		})
		.catch(() => {
			if (entry.request !== request) return;
			// A failed list request leaves the pointer and status unchanged; the next
			// session (or reconnect) tries again. Readers waiting for names stop waiting.
			entry.request = undefined;
			publish(entry, { failed: true });
			recordRegisterFact({
				kind: 'directory-unavailable',
				registerId: entry.value?.registerId ?? null,
			});
		});
	entry.request = request;
	return request;
}

/**
 * Raise the local counter floor to the server's. Never blocks a bind: the closure queue
 * re-adopts on `wcpos_closure_number_invalid`, and a payload without usable counters is ignored.
 */
async function adoptFromServer(
	http: Pick<ReturnType<typeof useRestHttpClient>, 'get'>,
	userDB: Parameters<typeof adoptCounters>[0],
	siteUuid: string,
	registerId: string
): Promise<void> {
	// Binding proceeds on the local floor either way, and the closure queue re-adopts on
	// `wcpos_closure_number_invalid`: self-healing, so info with no code. The transport's
	// own row is debug, so this is the one row that names the fallback — and which step failed.
	const logger = getLogger(['wcpos', 'register']);
	let counters: RegisterCounters | null;
	try {
		const row = (await http.get(`registers/${registerId}`)).data as Register;
		counters = readCounters(row?.counters);
	} catch (error) {
		logger.info("Register counters not refreshed from the store; using this device's counters", {
			context: { registerId, step: 'store-read', error: getErrorMessage(error) },
		});
		return;
	}
	if (!counters) return;
	try {
		await adoptCounters(userDB, siteUuid, registerId, counters);
	} catch (error) {
		logger.info(
			"Register counters from the store could not be saved on this device; using this device's counters",
			{ context: { registerId, step: 'local-adoption', error: getErrorMessage(error) } }
		);
	}
}

async function syncBinding(
	entry: Directory,
	http: Pick<ReturnType<typeof useRestHttpClient>, 'get'>,
	userDB: Parameters<typeof adoptCounters>[0],
	siteUuid: string,
	storeId: number | undefined,
	online: boolean
): Promise<void> {
	const adoptServerCounters = (id: string) => adoptFromServer(http, userDB, siteUuid, id);
	// Before the first await: a reader's effect may have started the list request already, and
	// its answer reads this at arrival time.
	entry.cache = { userDB, siteUuid };
	const bound = await readBoundRegister(userDB, siteUuid, storeId);
	publish(entry, {
		status: bound ? 'bound' : 'unknown',
		registerId: bound?.id ?? null,
		registerName: bound?.name ?? null,
	});
	if (!online) return;
	await loadDirectory(entry, http, storeId);
	if (!entry.loaded) return;
	const registers = entry.value.registers;
	if (bound && registers.some(({ id }) => id === bound.id)) {
		await adoptServerCounters(bound.id);
		return;
	}
	if (registers.length === 1) {
		await adoptServerCounters(registers[0].id);
		await bindRegister(userDB, siteUuid, registers[0], storeId);
		recordRegisterFact({
			kind: 'binding-changed',
			source: 'automatic',
			registerId: registers[0].id,
			previousRegisterId: bound?.id ?? null,
		});
		publish(entry, {
			status: 'bound',
			registerId: registers[0].id,
			registerName: registers[0].name,
		});
	} else {
		if (bound) {
			await unbindRegister(userDB, siteUuid, storeId);
			recordRegisterFact({ kind: 'binding-removed', registerId: bound.id });
		}
		publish(entry, {
			status: registers.length ? 'choose' : 'none',
			registerId: null,
			registerName: null,
		});
	}
}

export function useRegisterBindingSession(): void {
	const { userDB, site, store } = useStoreSession();
	const http = useRestHttpClient();
	const online = useOnlineStatus().status === 'online-website-available';
	const entry = directory(site.uuid!, store.id);
	// Synchronize the persisted pointer and the external register directory on session/connectivity changes.
	React.useEffect(() => {
		// A failed list request leaves the pointer/status unchanged; no retries.
		void syncBinding(entry, http, userDB, site.uuid!, store.id, online).catch(() => {});
	}, [entry, http, online, site.uuid, store.id, userDB]);
}

/** Read another store's directory without changing the physical till binding. */
/** Drops the cached answer and asks again; concurrent callers join the one request in flight. */
function refreshDirectory(
	entry: Directory,
	http: Pick<ReturnType<typeof useRestHttpClient>, 'get'>,
	storeId: number | undefined
) {
	if (entry.refresh) return entry.refresh;
	entry.request = undefined;
	entry.loaded = false;
	entry.refresh = loadDirectory(entry, http, storeId).finally(() => {
		entry.refresh = undefined;
	});
	return entry.refresh;
}

/**
 * Another store's directory, without binding. `fresh` asks again on every mount and whenever it
 * turns true, for a reader that must not trust a cached answer (the store confirm's target rows).
 */
export function useRegisterDirectory(storeId: number | undefined, { fresh = false } = {}) {
	const { site } = useStoreSession();
	const http = useRestHttpClient();
	const online = useOnlineStatus().status === 'online-website-available';
	const entry = directory(site.uuid!, storeId);
	// A reader mounted before (or without) the session hook still gets the directory.
	React.useEffect(() => {
		if (!online) return;
		if (fresh) void refreshDirectory(entry, http, storeId);
		else if (!entry.loaded) void loadDirectory(entry, http, storeId);
	}, [entry, fresh, http, online, storeId]);
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
	return value;
}

export function useRegisterBinding() {
	const { userDB, site, store } = useStoreSession();
	const actor = useRegisterActor();
	const online = useOnlineStatus().status === 'online-website-available';
	const http = useRestHttpClient();
	const value = useRegisterDirectory(store.id);
	const entry = directory(site.uuid!, store.id);
	const bind = React.useCallback(
		async (id: string) => {
			const register = entry.value.registers.find((row) => row.id === id);
			if (!register) return;
			const adoptServerCounters = (registerId: string) =>
				adoptFromServer(http, userDB, site.uuid!, registerId);
			const previousRegisterId = entry.value.registerId;
			await adoptServerCounters(id);
			await bindRegister(userDB, site.uuid!, register, store.id);
			publish(entry, { status: 'bound', registerId: id, registerName: register.name });
			if (previousRegisterId !== id)
				recordRegisterFact({
					kind: 'binding-changed',
					source: 'manual',
					actor,
					registerId: id,
					previousRegisterId,
				});
		},
		[actor, entry, http, site.uuid, store.id, userDB]
	);
	const retry = React.useCallback(() => {
		// Looked up inside the callback: the React compiler refuses a mutation of a render-scope
		// value, and the directory is the same module-level entry either way.
		const current = directory(site.uuid!, store.id);
		if (current.retry) return current.retry;
		current.request = undefined;
		current.loaded = false;
		// The sync republishes `unknown` and clears `failed` before the request answers; the
		// flag keeps the gate card up for that whole stretch instead of flashing the cart.
		publish(current, { retrying: current.value.failed ? 'failed' : 'none' });
		current.retry = syncBinding(current, http, userDB, site.uuid!, store.id, online)
			.catch(() => {})
			.finally(() => {
				current.retry = undefined;
				publish(current, { retrying: false });
			});
		return current.retry;
	}, [http, online, site.uuid, store.id, userDB]);
	const refresh = React.useCallback(
		() => refreshDirectory(directory(site.uuid!, store.id), http, store.id),
		[http, site.uuid, store.id]
	);
	return { ...value, bind, retry, refresh };
}
