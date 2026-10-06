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

export async function registryScopeIdentities(
	userDB: ScopeRegistryDatabase
): Promise<StoreScopeIdentity[]> {
	const scopes: StoreScopeIdentity[] = [];
	for (const site of await userDB.sites.find().exec()) {
		const { wp_api_url: wpApiUrl, wp_credentials: credentialIds = [] } = site.toJSON();
		if (!wpApiUrl) continue;
		const credentials = await userDB.wp_credentials.findByIds([...credentialIds]).exec();
		for (const credential of credentials.values()) {
			const { id: cashierId, stores: storeIds = [] } = credential.toJSON();
			if (cashierId === undefined) continue;
			const stores = await userDB.stores.findByIds([...storeIds]).exec();
			for (const store of stores.values()) {
				const { id: storeId } = store.toJSON();
				if (storeId === undefined) continue;
				scopes.push({ site: wpApiUrl, storeId, cashierId });
			}
		}
	}
	return scopes;
}
