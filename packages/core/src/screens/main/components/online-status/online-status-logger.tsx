import * as React from 'react';

import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import type { OnlineStatus } from '@wcpos/hooks/use-online-status';

import { useT } from '../../../../contexts/translations';

const logger = getLogger(['wcpos', 'app', 'connectivity']);
// A verdict that reverts within this window is interface flap, not an outage a
// cashier should see; five seconds covers Chrome's burst around one network change.
const CONNECTIVITY_SETTLE_MS = 5_000;

export function OnlineStatusLogger() {
	const { status } = useOnlineStatus();
	const t = useT();
	const prevStatusRef = React.useRef<OnlineStatus | null>(status);
	const lastLoggedStatusRef = React.useRef<OnlineStatus>(status);
	const translate = React.useEffectEvent(t);

	// External connectivity transitions must settle before this app-level mount
	// point alerts the cashier; cleanup restarts the verdict on every transition.
	React.useEffect(() => {
		const prevStatus = prevStatusRef.current;
		if (prevStatus === null) {
			prevStatusRef.current = status;
			return;
		}
		if (prevStatus === status) return;
		prevStatusRef.current = status;
		const timer = setTimeout(() => {
			if (status === lastLoggedStatusRef.current) return;
			switch (status) {
				// Messages stay forensic English (#1150); the registered `context.type`
				// is what the Logs UI translates at render time (#912), so the till
				// reads these rows in its own language.
				//
				// `warn`, not `error`, per the LEVELS.md rubric: `error` promises "needs
				// user action now", and in an offline-first POS going offline is an
				// expected operating mode that self-heals (the 'Connection restored' row
				// below closes the arc) — it "will need attention if it persists", which
				// is the `warn` promise. The level also reaches `console.*` on native:
				// at `error` the expo dev client draws a full-screen redbox over the app
				// on every transient blip (class 13; run 33487044969 iOS phone flow 05,
				// where it swallowed the drawer tap). The toast and the SYNC_UNEXPECTED
				// help link are unchanged.
				case 'offline':
					logger.warn('Device went offline', {
						code: ERROR_CODES.SYNC_UNEXPECTED,
						context: { type: 'connectivity.device-offline' },
						showToast: true,
						toast: { title: translate('common.device_went_offline') },
					});
					break;
				case 'online-website-unavailable':
					logger.warn('Website is unreachable', {
						code: ERROR_CODES.SYNC_UNEXPECTED,
						context: { type: 'connectivity.website-unreachable' },
						showToast: true,
						toast: { title: translate('common.website_is_unreachable') },
					});
					break;
				case 'online-website-available':
					logger.success('Connection restored', {
						context: { type: 'connectivity.restored' },
						showToast: true,
						toast: { title: translate('common.connection_restored') },
					});
					break;
			}
			lastLoggedStatusRef.current = status;
		}, CONNECTIVITY_SETTLE_MS);

		return () => clearTimeout(timer);
	}, [status]);

	return null;
}
