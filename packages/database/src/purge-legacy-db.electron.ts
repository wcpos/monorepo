import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

const dbLogger = getLogger(['wcpos', 'db', 'purge-legacy']);
type ElectronBridgeIpcRenderer = { invoke(channel: string): Promise<unknown> };

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
