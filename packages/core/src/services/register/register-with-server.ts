import type { UserDatabase } from '@wcpos/database';
import { AppInfo } from '@wcpos/utils/app-info';
import { log } from '@wcpos/utils/logger';

import { readRegister, type RegisterDocument } from './register-document';

export async function registerWithServer({
	userDB,
	http,
	siteUuid,
}: {
	userDB: UserDatabase;
	http: {
		post: (
			url: string,
			body: unknown
		) => Promise<{ status: number; data?: { store_id?: number | null } }>;
	};
	siteUuid: string;
}): Promise<void> {
	try {
		const register = await readRegister(userDB);
		if (!register) return;
		const { id, name, platform } = register;
		const app_version = AppInfo.version;
		// Every sign-in re-registers (the hook dedupes within a session): the server's
		// answer is how the till learns a store move made in wp-admin, and how
		// last_seen stays current. A persisted "same name, same version" skip would
		// keep a stale binding for as long as neither changed.
		const response = await http.post('registers', { id, name, platform, app_version });
		if (!(response.status >= 200 && response.status < 300))
			throw new Error(`Register HTTP ${response.status}`);
		const storeId = response.data?.store_id;
		const doc = await userDB.getLocal<RegisterDocument>('register');
		await doc?.incrementalModify((data) => ({
			...data,
			sites: {
				...data.sites,
				[siteUuid]: {
					...(data.sites[siteUuid] ?? { sale_counter: 0, store_id: null }),
					...(typeof storeId === 'number' ? { store_id: storeId } : {}),
					registration: { at: new Date().toISOString(), name, app_version },
				},
			},
		}));
	} catch (error) {
		log.info('Register registration deferred', { context: { error: String(error) } });
	}
}
