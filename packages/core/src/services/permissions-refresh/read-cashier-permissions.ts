import { clearCashierCapabilities, recordCashierProfile } from '@wcpos/query/user-db';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import type { useHttpClient } from '@wcpos/hooks/use-http-client';

import { cashierRequest, recoverCashierBody } from '../../hooks/use-user-validation';

import type { StoreSessionState } from '../../contexts/app-state';

const logger = getLogger(['wcpos', 'permissions']);

export type PermissionsReadResult =
	| { kind: 'updated'; granted: number; removed: number }
	| { kind: 'unchanged' }
	| { kind: 'refused'; status: number }
	| { kind: 'expired' }
	| { kind: 'offline' }
	| { kind: 'failed' };

export function storeAnsweredWithStatus(error: unknown): number | null {
	const status = (error as { response?: { status?: unknown } } | null)?.response?.status;
	return typeof status === 'number' ? status : null;
}

export async function readCashierPermissions({
	http,
	site,
	wpCredentials,
	userDB,
	user,
}: Pick<StoreSessionState, 'site' | 'wpCredentials' | 'userDB' | 'user'> & {
	http: Pick<ReturnType<typeof useHttpClient>, 'get'>;
}): Promise<PermissionsReadResult> {
	try {
		const latest = wpCredentials.getLatest();
		const before = new Set(latest.capabilities ?? []);
		const { endpoint, config } = cashierRequest(site, latest.id!, latest.access_token!);
		const { data: raw } = await http.get(endpoint, { ...config, unauthenticated: true });
		const data: unknown = recoverCashierBody(raw, latest.id!) ?? raw;
		if (!data || typeof data !== 'object' || !('id' in data) || data.id !== latest.id) {
			logger.warn('Could not read cashier permissions: invalid cashier record');
			return { kind: 'failed' };
		}
		await recordCashierProfile(userDB, wpCredentials, data, {
			userUuid: user.uuid,
			siteUuid: site.uuid,
		});
		const after = new Set(wpCredentials.getLatest().capabilities ?? []);
		const granted = [...after].filter((capability) => !before.has(capability)).length;
		const removed = [...before].filter((capability) => !after.has(capability)).length;
		return granted || removed ? { kind: 'updated', granted, removed } : { kind: 'unchanged' };
	} catch (error) {
		const status = storeAnsweredWithStatus(error);
		if (status !== null && status !== 401) {
			try {
				await clearCashierCapabilities(wpCredentials);
			} catch (clearError) {
				error = clearError;
			}
		}
		logger.warn('Could not read cashier permissions', {
			context: { error: getErrorMessage(error), status },
		});
		if (status === 401) return { kind: 'expired' };
		return status === null ? { kind: 'offline' } : { kind: 'refused', status };
	}
}
