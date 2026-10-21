import * as React from 'react';

import {
	currentUpdateRequired,
	reportUpdateRequired,
	subscribeUpdateRequired,
	type UpdateRequiredState,
} from '@wcpos/utils/update-required-gate';

/**
 * The server's protocol-gate refusal (wcpos_update_required) is latched per
 * site under the site's `wp_api_url`: the sync engine's scope site, the in-app
 * UpdateRequiredGate, the REST client and the login card all use that one key.
 * These hooks are the only place a UI reads or reports it, so the key cannot
 * drift between the reporter and the surface. An empty key is never gated.
 */
export function useUpdateRequired(wpApiUrl: string | undefined): UpdateRequiredState {
	const subscribe = React.useCallback(
		(onChange: () => void) => (wpApiUrl ? subscribeUpdateRequired(wpApiUrl, onChange) : () => {}),
		[wpApiUrl]
	);
	const getSnapshot = React.useCallback(
		() => (wpApiUrl ? currentUpdateRequired(wpApiUrl) : null),
		[wpApiUrl]
	);
	return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** A stable `onUpdateRequired` for `useHttpClient` that latches the gate for this site. */
export function useReportUpdateRequired(
	wpApiUrl: string | undefined
): (details: Exclude<UpdateRequiredState, null>) => void {
	return React.useCallback(
		(details: Exclude<UpdateRequiredState, null>) => {
			if (wpApiUrl) reportUpdateRequired(wpApiUrl, details);
		},
		[wpApiUrl]
	);
}
