import * as React from 'react';

import { sameStoreOrigin } from '@wcpos/components/webview/same-store-origin';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useAppState } from '../../../../../contexts/app-state';

const payLinkLogger = getLogger(['wcpos', 'pos', 'checkout', 'payment']);

/**
 * Whether the pay link is on the store's own host (its API's host, the www twin, http to https).
 * The hosts treat any other link as none: the missing-link notice, and no token sent to it.
 */
export function useStorePayLink(paymentURL: string | null | undefined): boolean {
	// No site means no store origin: every pay link is then foreign and refused.
	const storeURL = useAppState().site?.wcpos_api_url;
	const usable = sameStoreOrigin(paymentURL, storeURL);
	const foreign = !!paymentURL && !usable;
	React.useEffect(() => {
		if (!foreign) return;
		// The host only (URL.host never carries userinfo): the full link carries the order key.
		let payLinkHost: string | null;
		try {
			payLinkHost = new URL(String(paymentURL)).host;
		} catch {
			payLinkHost = null;
		}
		payLinkLogger.error('The order’s pay link is not on the store’s own host', {
			code: ERROR_CODES.CHECKOUT_FAILED_CART_SAFE,
			context: { payLinkHost, storeURL },
		});
	}, [foreign, paymentURL, storeURL]);
	return usable;
}
