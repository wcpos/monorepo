import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateZSchemaStorage } from 'rxdb/plugins/validate-z-schema';

import type { StoreScopeIdentity, SyncEvent } from '@wcpos/sync-core';

import { createRxdbSyncEngine } from './create-rxdb-sync-engine';

import type {
	EngineConnectivity,
	EngineEvent,
	EngineFetcher,
	EngineIntervals,
	EngineStringStore,
	RxdbSyncEngine,
	RxdbSyncEnginePorts,
} from './create-rxdb-sync-engine';
import type { EngineTimers } from './engine-timers';
import type { QueryTotalPort } from './maintenance/maintenance-lanes';
import type { RxCollection, RxStorage } from 'rxdb';

export type EngineHarnessRequest = {
	url: string;
	init?: RequestInit;
	method: string;
	path: string;
};

export type EngineHarnessRoute =
	| Response
	| unknown
	| ((request: EngineHarnessRequest) => Response | unknown | Promise<Response | unknown>);

export type CapturedEngineTimers = EngineTimers & {
	timeouts: readonly {
		callback: () => void;
		delayMs: number;
		handle: ReturnType<typeof setTimeout>;
	}[];
	intervals: readonly {
		callback: () => void;
		delayMs: number;
		handle: ReturnType<typeof setInterval>;
	}[];
	fireTimeout(index?: number): void;
	fireInterval(index?: number): void;
};

export type EngineHarnessOptions = {
	site?: string | RxdbSyncEnginePorts['site'];
	identity?: StoreScopeIdentity;
	mode?: 'auto' | 'manual';
	storage?: RxStorage<unknown, unknown>;
	validateSchemas?: boolean;
	checkpoints?: EngineStringStore;
	intervals?: Partial<EngineIntervals>;
	queryTotal?: QueryTotalPort;
	connectivity?: EngineConnectivity;
	routes?: Record<string, EngineHarnessRoute>;
	fetch?: EngineFetcher;
	startAtMs?: number;
	random?: () => number;
	captureTimers?: boolean;
	awaitReady?: boolean;
	ports?: Partial<RxdbSyncEnginePorts>;
};

export type EngineHarness = {
	engine: RxdbSyncEngine;
	identity: StoreScopeIdentity;
	site: RxdbSyncEnginePorts['site'];
	diagnostics: SyncEvent[];
	events: EngineEvent[];
	ofType<T extends SyncEvent['type']>(type: T): Extract<SyncEvent, { type: T }>[];
	requests: EngineHarnessRequest[];
	respond(response: Response | Error, options?: { elapsedMs?: number }): Promise<void>;
	clock: { now(): number; set(ms: number): void; advance(ms: number): void };
	connectivity: { set(state: EngineConnectivity): void };
	timers: CapturedEngineTimers | null;
	collection<Document = Record<string, unknown>>(name: string): RxCollection<Document>;
	seed(name: string, documents: Record<string, unknown>[]): Promise<void>;
	dispose(): Promise<void>;
	[Symbol.asyncDispose](): Promise<void>;
};

let nextHarnessIdentity = 0;
const trackedEngines = new Set<RxdbSyncEngine>();

function json(value: unknown): Response {
	return Response.json(value);
}

function capturedTimers(): CapturedEngineTimers {
	const timeouts: {
		callback: () => void;
		delayMs: number;
		handle: ReturnType<typeof setTimeout>;
	}[] = [];
	const intervals: {
		callback: () => void;
		delayMs: number;
		handle: ReturnType<typeof setInterval>;
	}[] = [];
	let nextHandle = 1;
	return {
		timeouts,
		intervals,
		setTimeout: (callback, delayMs) => {
			const handle = nextHandle++ as unknown as ReturnType<typeof setTimeout>;
			timeouts.push({ callback, delayMs, handle });
			return handle;
		},
		clearTimeout: (handle) => {
			const index = timeouts.findIndex((timer) => timer.handle === handle);
			if (index >= 0) timeouts.splice(index, 1);
		},
		setInterval: (callback, delayMs) => {
			const handle = nextHandle++ as unknown as ReturnType<typeof setInterval>;
			intervals.push({ callback, delayMs, handle });
			return handle;
		},
		clearInterval: (handle) => {
			const index = intervals.findIndex((timer) => timer.handle === handle);
			if (index >= 0) intervals.splice(index, 1);
		},
		unref: () => undefined,
		fireTimeout: (index = 0) => {
			const [timer] = timeouts.splice(index, 1);
			if (timer === undefined) throw new Error(`No captured timeout at index ${index}`);
			timer.callback();
		},
		fireInterval: (index = 0) => {
			const timer = intervals[index];
			if (timer === undefined) throw new Error(`No captured interval at index ${index}`);
			timer.callback();
		},
	};
}

function routeFor(
	routes: Record<string, EngineHarnessRoute>,
	request: EngineHarnessRequest
): EngineHarnessRoute | undefined {
	return Object.entries(routes).find(
		([match]) => request.url === match || request.path === match || request.path.endsWith(match)
	)?.[1];
}

async function routeResponse(
	route: EngineHarnessRoute,
	request: EngineHarnessRequest
): Promise<Response> {
	const value = typeof route === 'function' ? await route(request) : route;
	return value instanceof Response ? value : json(value);
}

async function disposeTrackedEngines(): Promise<void> {
	const engines = [...trackedEngines];
	trackedEngines.clear();
	await Promise.allSettled(
		engines.map((engine) => (engine.status().disposed ? Promise.resolve() : engine.dispose()))
	);
}

function createEngineHarnessImpl(
	options: EngineHarnessOptions = {}
): EngineHarness | Promise<EngineHarness> {
	nextHarnessIdentity += 1;
	let nowMs = options.startAtMs ?? 1_000;
	let connectivityState = options.connectivity ?? 'online';
	let scripted: { response: Response | Error; elapsedMs: number } | null = null;
	const diagnostics: SyncEvent[] = [];
	const events: EngineEvent[] = [];
	const requests: EngineHarnessRequest[] = [];
	const timers = options.captureTimers === true ? capturedTimers() : null;
	const site =
		typeof options.site === 'string'
			? { syncBaseUrl: `${options.site}/wp-json/wcpos/v2`, wpJsonRoot: `${options.site}/wp-json` }
			: (options.site ?? {
					syncBaseUrl: 'https://engine-harness.example.test/wp-json/wcpos/v2',
					wpJsonRoot: 'https://engine-harness.example.test/wp-json',
				});
	const identity =
		options.identity ??
		({
			site: new URL(site.syncBaseUrl).origin,
			storeId: 1,
			cashierId: `engine-harness-${nextHarnessIdentity}`,
		} satisfies StoreScopeIdentity);
	const storage =
		options.storage ??
		(options.validateSchemas === false
			? (getRxStorageMemory() as RxStorage<unknown, unknown>)
			: (wrappedValidateZSchemaStorage({ storage: getRxStorageMemory() }) as RxStorage<
					unknown,
					unknown
				>));
	const routes = options.routes ?? {};
	const fetcher: EngineFetcher = async (url, init) => {
		const request: EngineHarnessRequest = {
			url,
			...(init === undefined ? {} : { init }),
			method: init?.method ?? 'GET',
			path: new URL(url).pathname,
		};
		if (scripted !== null) {
			const next = scripted;
			scripted = null;
			nowMs += next.elapsedMs;
			if (next.response instanceof Error) throw next.response;
			return next.response;
		}
		const route = routeFor(routes, request);
		if (route !== undefined) {
			requests.push(request);
			return routeResponse(route, request);
		}
		if (options.fetch !== undefined) {
			requests.push(request);
			return options.fetch(url, init);
		}
		if (request.path.endsWith('/changes/config-fingerprint')) {
			return json({ fingerprints: {} });
		}
		requests.push(request);
		return json({ changes: [], complete: true, documents: [] });
	};
	const engine = createRxdbSyncEngine(
		{
			site,
			storage,
			mode: options.mode ?? 'manual',
			fetcher,
			now: () => nowMs,
			random: options.random ?? (() => 0.5),
			connectivity: () => connectivityState,
			diagnostics: (event) => diagnostics.push(event),
			...(options.checkpoints === undefined ? {} : { checkpoints: options.checkpoints }),
			...(options.intervals === undefined ? {} : { intervals: options.intervals }),
			...(options.queryTotal === undefined ? {} : { queryTotal: options.queryTotal }),
			...(timers === null ? {} : { timers }),
			...options.ports,
		},
		identity
	);
	trackedEngines.add(engine);
	engine.events((event) => events.push(event));
	const dispose = async (): Promise<void> => {
		trackedEngines.delete(engine);
		if (!engine.status().disposed) await engine.dispose();
	};
	const collection = <Document = Record<string, unknown>>(name: string): RxCollection<Document> => {
		const scope = engine.active();
		if (scope === null) {
			throw new Error(`Engine harness has no active scope; cannot access collection "${name}"`);
		}
		const storageName = name === 'mutations' ? 'recordMutations' : name;
		const value = scope.database.collections[storageName];
		if (value === undefined) throw new Error(`Engine harness collection "${name}" does not exist`);
		return value as unknown as RxCollection<Document>;
	};
	const harness: EngineHarness = {
		engine,
		identity,
		site,
		diagnostics,
		events,
		ofType: (type) =>
			diagnostics.filter(
				(event): event is Extract<SyncEvent, { type: typeof type }> => event.type === type
			),
		requests,
		respond: async (response, respondOptions) => {
			scripted = { response, elapsedMs: respondOptions?.elapsedMs ?? 0 };
			await engine
				.hostTransport()
				.fetcher(`${site.syncBaseUrl}/changes/tick`)
				.catch(() => undefined);
		},
		clock: {
			now: () => nowMs,
			set: (ms) => {
				nowMs = ms;
			},
			advance: (ms) => {
				nowMs += ms;
			},
		},
		connectivity: {
			set: (state) => {
				connectivityState = state;
			},
		},
		timers,
		collection,
		seed: async (name, documents) => {
			await collection(name).bulkInsert(documents);
		},
		dispose,
		[Symbol.asyncDispose]: dispose,
	};
	return options.awaitReady === false ? harness : engine.ready.then(() => harness);
}

type CreateEngineHarness = {
	(options: EngineHarnessOptions & { awaitReady: false }): EngineHarness;
	(options?: EngineHarnessOptions): Promise<EngineHarness>;
	disposeTrackedEngines(): Promise<void>;
};

export const createEngineHarness = Object.assign(createEngineHarnessImpl, {
	disposeTrackedEngines,
}) as CreateEngineHarness;
