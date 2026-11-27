import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

const dbLogger = getLogger(['wcpos', 'db', 'purge-legacy']);
type ElectronBridgeIpcRenderer = { invoke(channel: string): Promise<unknown> };

/**
 * The main process (wcpos/electron `src/main/purge-legacy-databases.ts`) removes
 * the two retired roots: `wcpos_fsdbs` whole and the `.sqlite3` files in
 * `wcpos_dbs`. A retired generation (`v8`/`v9`) inside the LIVE root
 * `wcpos_sqlite` is not purged: the main process does not know the current
 * generation (`DATABASE_GENERATION` lives here and this channel carries no
 * arguments), so naming it is a two-repo change to the IPC contract. Those files
 * go with "Clear local data", which the main process answers by relaunching and
 * wiping every root, the live one included (`clear-all-db.electron.ts`).
 */
export async function purgeLegacyDatabases(): Promise<unknown> {
	try {
		const ipcRenderer = (window as unknown as Window & { ipcRenderer: ElectronBridgeIpcRenderer })
			.ipcRenderer;
		return await ipcRenderer.invoke('purgeLegacyDatabases');
	} catch (error) {
		dbLogger.error('Failed to purge legacy databases', {
			code: ERROR_CODES.LOCAL_DB_SETUP_FAILED,
			context: { error: error instanceof Error ? error.message : String(error) },
		});
	}
}
