const RECOVERY_SESSION_KEY = 'wcpos_logs_storage_recovery_attempted';
const SYNC_RECOVERY_SESSION_KEY_PREFIX = 'wcpos_sync_storage_recovery_attempted_';

type RemovableCollection = {
	name?: string;
	remove?: () => Promise<unknown>;
};

type RecoveryOptions = {
	reload?: () => void;
};

function stringifyError(error: unknown): string {
	if (error instanceof Error) {
		return `${error.name} ${error.message} ${error.stack ?? ''}`;
	}

	try {
		return JSON.stringify(error);
	} catch {
		return String(error);
	}
}

function getSessionStorage(): Storage | undefined {
	try {
		return globalThis.sessionStorage;
	} catch {
		return undefined;
	}
}

function reloadPage(): void {
	const reload = globalThis.location?.reload;
	if (typeof reload === 'function') {
		reload.call(globalThis.location);
	}
}

/**
 * Detects the OPFS/RxDB failure seen when a local collection file contains
 * malformed JSON. The worker wraps the SyntaxError in a requestRemote error.
 */
export function isRecoverableLogsStorageError(error: unknown): boolean {
	const text = stringifyError(error);
	const hasRemoteStorageSignal =
		text.includes('requestRemote') || text.includes('opfs.worker') || text.includes('JSON.parse');
	const hasJsonParseSignal =
		text.includes('SyntaxError') &&
		(text.includes('Expected') || text.includes('JSON') || text.includes('property name'));

	return hasRemoteStorageSignal && hasJsonParseSignal;
}

/**
 * Resets only the local logs collection and reloads the app once. This is used
 * for corrupted local diagnostic logs; it intentionally avoids touching business
 * data collections.
 */
export async function recoverLogsCollectionStorage(
	collection: RemovableCollection | undefined,
	error: unknown,
	options: RecoveryOptions = {}
): Promise<boolean> {
	if (collection?.name !== 'logs' || typeof collection.remove !== 'function') {
		return false;
	}

	if (!isRecoverableLogsStorageError(error)) {
		return false;
	}

	const sessionStorage = getSessionStorage();
	if (sessionStorage?.getItem(RECOVERY_SESSION_KEY) === '1') {
		return false;
	}

	await collection.remove();
	sessionStorage?.setItem(RECOVERY_SESSION_KEY, '1');
	(options.reload ?? reloadPage)();
	return true;
}

/**
 * Resets local sync metadata for a synced collection and reloads the app once.
 * Sync collections contain server reconciliation state only; dropping them lets
 * the next page load rebuild metadata from the authoritative remote endpoint.
 */
export async function recoverSyncCollectionStorage(
	collection: RemovableCollection | undefined,
	error: unknown,
	options: RecoveryOptions = {}
): Promise<boolean> {
	if (!collection?.name || typeof collection.remove !== 'function') {
		return false;
	}

	if (!isRecoverableLogsStorageError(error)) {
		return false;
	}

	const sessionKey = `${SYNC_RECOVERY_SESSION_KEY_PREFIX}${collection.name}`;
	const sessionStorage = getSessionStorage();
	if (sessionStorage?.getItem(sessionKey) === '1') {
		return false;
	}

	await collection.remove();
	sessionStorage?.setItem(sessionKey, '1');
	(options.reload ?? reloadPage)();
	return true;
}
