import { isExpectedPreflightBlock } from '@wcpos/hooks/use-http-client/is-expected-preflight-block';
import { getErrorMessage } from '@wcpos/utils/logger';
import { ERROR_CATALOGUE, ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import type { ExtendedLogger } from '@wcpos/utils/logger';

import { storeRequestFailureCode } from '../../../utils/store-request-failure-code';

type Translate = (key: string) => string;

/**
 * The merchant pressed Restore, so a failure is shown, never only logged: offline
 * says nothing was changed and to try again once connected; anything else carries
 * the code of what the store actually answered. The settings stay as they were.
 * `toast: false` is for a surface that already shows the failure inline (with its
 * own Try again): the row is still written, with the same code, but no toast.
 */
export function reportRestoreFailure(
	logger: Pick<ExtendedLogger, 'warn' | 'error'>,
	error: unknown,
	t: Translate,
	{ toast = true }: { toast?: boolean } = {}
): void {
	const context = { error: getErrorMessage(error) };
	if (isExpectedPreflightBlock(error)) {
		logger.warn('Store settings not restored: offline', {
			code: ERROR_CODES.SYNC_UNREACHABLE,
			...(toast
				? {
						showToast: true,
						toast: {
							title: t('settings.restore_offline'),
							text2: t('settings.reconnect_then_restore'),
						},
					}
				: {}),
			context,
		});
		return;
	}
	const code = storeRequestFailureCode(error);
	logger[ERROR_CATALOGUE[code].severity === 'error' ? 'error' : 'warn'](
		'Failed to restore server settings',
		{ ...(toast ? { showToast: true } : {}), code, context }
	);
}
