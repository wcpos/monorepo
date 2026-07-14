/**
 * TRANSITIONAL REMNANT — `@deprecated` increment-3.
 *
 * The old replication machine is gone (ADR 0023 increment 1b). Everything here
 * exists ONLY so `packages/core`'s `use-mutation` and `use-stock-adjustment`
 * keep compiling and working unchanged until increment-3 migrates them onto the
 * engine's `write()` / `require()` verbs directly:
 *
 *  - {@link DataFetcher} is cut down to the immediate wc/v3 mutations
 *    (`remotePatch` / `remoteCreate`) reached through the host http client.
 *  - {@link CollectionReplicationState} keeps the public name Core imports. Its
 *    `remotePatch` / `remoteCreate` funnel straight to wc/v3; its `sync({include})`
 *    maps to `engine.require({kind:'targeted-records', wooIds, forceRefresh:true})`.
 *    The `active$` / `total$` / `paused$` observables and `start`/`pause`/`run`/
 *    `cancel` are inert compatibility shims (no polling machine backs them).
 *
 * Do NOT extend this. It is deleted at increment-3.
 */

import { BehaviorSubject } from 'rxjs';

import { getLogger } from '@wcpos/utils/logger';
import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import { engineCollectionNameFor, isMappedCollection } from './engine-adapter/collection-map';

import type { EngineCollectionName } from './engine-adapter/collection-map';

const fetcherLogger = getLogger(['wcpos', 'query', 'data-fetcher']);

/**
 * The thin wc/v3 HTTP seam for immediate mutations. @deprecated increment-3.
 */
export class DataFetcher {
	private httpClient: any;
	public endpoint: string;

	constructor(httpClient: any, endpoint: string) {
		this.httpClient = httpClient;
		this.endpoint = endpoint;
	}

	remotePatch(doc: any, data: any, signal?: AbortSignal) {
		let endpoint = `${this.endpoint}/${doc.id}`;
		if (this.endpoint === 'variations') {
			endpoint = `products/${doc.parent_id}/variations/${doc.id}`;
		}
		return this.httpClient.patch(endpoint, data, { signal });
	}

	remoteCreate(data: any, signal?: AbortSignal) {
		return this.httpClient.post(this.endpoint, data, { signal });
	}
}

interface CollectionReplicationConfig<T> {
	httpClient: any;
	collection: T;
	endpoint: string;
	/** The engine, for the targeted-records `sync({include})` path. */
	engine?: RxdbSyncEngine;
}

/**
 * TRANSITIONAL — `@deprecated` increment-3. Keeps the public `CollectionReplicationState`
 * name and the `remotePatch` / `remoteCreate` / `sync` surface Core calls directly.
 */
export class CollectionReplicationState<T = any> {
	public readonly collection: T;
	public readonly endpoint: string;
	private readonly dataFetcher: DataFetcher;
	private readonly engine?: RxdbSyncEngine;

	/** Inert compatibility observables (no polling machine backs them). */
	public readonly active$ = new BehaviorSubject<boolean>(false);
	public readonly total$ = new BehaviorSubject<number>(0);
	public readonly paused$ = new BehaviorSubject<boolean>(true);
	public readonly firstSync = Promise.resolve();

	constructor({ httpClient, collection, endpoint, engine }: CollectionReplicationConfig<T>) {
		this.collection = collection;
		this.endpoint = endpoint;
		this.dataFetcher = new DataFetcher(httpClient, endpoint);
		this.engine = engine;
	}

	/** Compatibility no-ops — the demand plane owns lifecycle now. */
	start(): void {}
	pause(): void {}
	async run(_options?: { force?: boolean }): Promise<void> {}
	async cancel(): Promise<void> {
		this.active$.complete();
		this.total$.complete();
		this.paused$.complete();
	}

	private engineCollectionName(): EngineCollectionName | null {
		const name = (this.collection as any)?.name as string | undefined;
		if (name && isMappedCollection(name)) {
			return engineCollectionNameFor(name);
		}
		return null;
	}

	/**
	 * Targeted re-pull of specific records. Maps to the engine's demand plane.
	 * Fire-and-forget (Core does not await it); best-effort with a swallowed reject.
	 */
	sync(options?: { include?: number[]; force?: boolean; greedy?: boolean }): void {
		const engine = this.engine;
		const engineCollection = this.engineCollectionName();
		const wooIds = (options?.include ?? []).filter((id) => typeof id === 'number');
		if (!engine || !engineCollection || wooIds.length === 0) {
			return;
		}
		const handle = engine.require({
			id: `transitional-sync:${this.endpoint}:${wooIds.join(',')}`,
			collection: engineCollection,
			kind: 'targeted-records',
			wooIds,
			forceRefresh: true,
		});
		handle.ready.then(
			() => handle.release(),
			() => handle.release()
		);
	}

	remotePatch = async (doc: any, data: any) => {
		try {
			if (!doc?.id) {
				throw new Error('document does not have an id');
			}
			const response = await this.dataFetcher.remotePatch(doc, data);
			if (!response?.data) {
				throw new Error('Invalid response data for remote patch');
			}
			const parse = (this.collection as any)?.parseRestResponse;
			return typeof parse === 'function'
				? parse.call(this.collection, response.data)
				: response.data;
		} catch (error: any) {
			fetcherLogger.error(error?.wpMessage || error?.message || 'Failed to update item', {
				showToast: true,
				saveToDb: true,
				context: { endpoint: this.endpoint, documentId: doc?.id },
			});
		}
	};

	remoteCreate = async (data: any) => {
		try {
			const response = await this.dataFetcher.remoteCreate(data);
			if (!response?.data) {
				throw new Error('Invalid response data for remote create');
			}
			const parse = (this.collection as any)?.parseRestResponse;
			return typeof parse === 'function'
				? parse.call(this.collection, response.data)
				: response.data;
		} catch (error: any) {
			fetcherLogger.error(error?.wpMessage || error?.message || 'Failed to create item', {
				showToast: true,
				saveToDb: true,
				context: { endpoint: this.endpoint },
			});
		}
	};
}
