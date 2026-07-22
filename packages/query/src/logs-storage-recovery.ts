import type { RxdbSyncEngine, SyncCollectionName } from '@wcpos/sync-engine';

const RECOVERY_SESSION_KEY = 'wcpos_logs_storage_recovery_attempted';
const ENGINE_RECOVERY_SESSION_KEY_PREFIX = 'wcpos_engine_storage_recovery_attempted_';

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

export async function recoverEngineCollectionStorage(
	engine: RxdbSyncEngine,
	collection: SyncCollectionName,
	error: unknown,
	options: RecoveryOptions = {}
): Promise<boolean> {
	const scopeId = engine.active()?.scopeId;
	if (!scopeId || !isRecoverableLogsStorageError(error)) return false;

	const sessionKey = `${ENGINE_RECOVERY_SESSION_KEY_PREFIX}${scopeId}_${collection}`;
	const sessionStorage = getSessionStorage();
	if (sessionStorage?.getItem(sessionKey) === '1') return false;

	await engine.scope
		.resetCollection(collection, {
			beforeDrop: async (active) => {
				if (active.scopeId !== scopeId || sessionStorage?.getItem(sessionKey) === '1') throw error;
				sessionStorage?.setItem(sessionKey, '1');
			},
		})
		.catch((resetError) => (sessionStorage?.removeItem(sessionKey), Promise.reject(resetError)));
	(options.reload ?? reloadPage)();
	return true;
}
