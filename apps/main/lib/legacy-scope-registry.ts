/**
 * Every store scope the app's user database knows: each site's cashiers × each
 * cashier's stores, as the identities the engine names scope databases by
 * (`{ site: wp_api_url, storeId: store.id, cashierId: wpCredentials.id }` — the
 * same composition `app/(app)/_layout.tsx` gives `createAppSyncEngine`).
 *
 * The web/Electron half of the previous-generation inventory reads it
 * (`inventoryLegacyScopeDatabases`): those platforms cannot list their database
 * files, so the scopes the till could have used are the ones it might hold one for.
 */
import type { StoreScopeIdentity } from '@wcpos/sync-engine';

type Doc<T> = { toJSON(): T };
type Finder<T> = {
	find(): { exec(): Promise<Doc<T>[]> };
	findByIds(ids: string[]): { exec(): Promise<Map<string, Doc<T>>> };
};

/** Structural: the three user-database collections the registry is read from. */
export type ScopeRegistryDatabase = {
	sites: Pick<Finder<{ wp_api_url?: string; wp_credentials?: string[] }>, 'find'>;
	wp_credentials: Pick<Finder<{ id?: number | string; stores?: string[] }>, 'findByIds'>;
	stores: Pick<Finder<{ id?: number | string }>, 'findByIds'>;
};

/**
 * The registry's scopes, and every reference it could NOT resolve: a site's
 * cashier id or a cashier's store id with no document behind it (a
 * reconciliation that removed a store while a credential kept pointing at it).
 * `findByIds` silently omits a missing document, so a scope behind one would
 * just vanish from the inventory; it is reported instead, and the inventory is
 * then incomplete.
 */
export async function registryScopeIdentities(
	userDB: ScopeRegistryDatabase
): Promise<{ scopes: StoreScopeIdentity[]; unresolved: string[] }> {
	const scopes: StoreScopeIdentity[] = [];
	const unresolved: string[] = [];
	for (const site of await userDB.sites.find().exec()) {
		const { wp_api_url: wpApiUrl, wp_credentials: credentialIds = [] } = site.toJSON();
		if (!wpApiUrl) continue;
		const credentials = await userDB.wp_credentials.findByIds([...credentialIds]).exec();
		for (const id of credentialIds)
			if (!credentials.has(id)) unresolved.push(`wp_credentials:${id}`);
		for (const credential of credentials.values()) {
			const { id: cashierId, stores: storeIds = [] } = credential.toJSON();
			if (cashierId === undefined) continue;
			const stores = await userDB.stores.findByIds([...storeIds]).exec();
			for (const id of storeIds) if (!stores.has(id)) unresolved.push(`stores:${id}`);
			for (const store of stores.values()) {
				const { id: storeId } = store.toJSON();
				if (storeId === undefined) continue;
				scopes.push({ site: wpApiUrl, storeId, cashierId });
			}
		}
	}
	return { scopes, unresolved };
}
