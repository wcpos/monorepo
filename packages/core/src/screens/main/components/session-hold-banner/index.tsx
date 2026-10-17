import * as React from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '@wcpos/components/text';
import { requestStateManager } from '@wcpos/hooks/use-http-client/request-state-manager';
import { useDocField, useQueryRuntime } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useStoreSession } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { useEngineStatus, useMutationCounts } from '../../hooks/use-engine-monitor';
import { useSessionLoginFlow } from '../../hooks/use-rest-http-client/use-session-login-flow';

const logger = getLogger(['wcpos', 'auth', 'error']);
let holdToastShown = false;

/** Test-only reset of shared hold toast state. */
export function resetSessionHoldBannerState() {
	holdToastShown = false;
}

type SessionHold = { syncBacklogSales: number; login: () => void };

const SessionHoldContext = React.createContext<SessionHold | null>(null);

/**
 * A refused session is a STATE that lasts until the cashier logs in, so it is
 * a banner; the toast only marks the moment it starts.
 *
 * The state has ONE owner, mounted once for the store session: every page bar
 * renders a `SessionHoldBanner`, and visited drawer screens stay mounted, so a
 * per-banner owner would let the first instance clear the shared latch on a
 * renewal while the banner on screen kept showing the hold (Codex review, #2611).
 */
export function SessionHoldProvider({ children }: { children: React.ReactNode }) {
	const runtime = useQueryRuntime();
	const status = useEngineStatus();
	const { syncBacklogSales } = useMutationCounts();
	const { site, wpCredentials, logout } = useStoreSession();
	const { triggerAuthFlow } = useSessionLoginFlow(site, wpCredentials, logout);
	const t = useT();
	const accessToken = useDocField(wpCredentials, (value) => value.access_token);
	const previousAccessToken = React.useRef(accessToken);
	const [recovered, setRecovered] = React.useState(false);
	const held = status.writeSessionHeld || status.authRequired;
	// Recovery hides the stale hold only until the engine publishes its next snapshot
	// (previous-value-in-state: a new snapshot identity resets the flag during render).
	const [seenStatus, setSeenStatus] = React.useState(status);
	if (seenStatus !== status) {
		setSeenStatus(status);
		if (recovered) setRecovered(false);
	}

	// A renewed token can be refused too: when the latch sets again, the banner must show again.
	React.useEffect(
		() => requestStateManager.onAuthFailed((failed) => failed && setRecovered(false)),
		[]
	);

	// Shared credential document changes arrive outside this component (e.g. another tab).
	React.useEffect(() => {
		const changed = previousAccessToken.current !== accessToken;
		previousAccessToken.current = accessToken;
		if (changed && requestStateManager.isAuthFailed()) {
			requestStateManager.clearAuthFailure();
			runtime.engine.sessionRestored();
			setRecovered(true);
			logger.info('Session renewed by another tab', {
				showToast: true,
				toast: { title: t('auth.session_renewed_automatically') },
				context: { siteName: site.name },
			});
		}
	}, [accessToken, runtime, site.name, t]);

	// The toast marks an external engine state transition, once per hold.
	React.useEffect(() => {
		if (held && !holdToastShown) {
			logger.warn('Please log in to continue', {
				showToast: true,
				toast: {
					action: { label: t('auth.log_in'), onClick: () => triggerAuthFlow() },
				},
				code: ERROR_CODES.SESSION_EXPIRED,
				context: { siteName: site.name },
			});
			holdToastShown = true;
		}
		if (!held) {
			holdToastShown = false;
		}
	}, [held, site.name, t, triggerAuthFlow]);

	// A recovery answers the auth hold only; a held write session keeps its sales warning.
	const visible = held && !(recovered && !status.writeSessionHeld);
	const value = React.useMemo(
		() => (visible ? { syncBacklogSales, login: () => triggerAuthFlow() } : null),
		[visible, syncBacklogSales, triggerAuthFlow]
	);

	return <SessionHoldContext.Provider value={value}>{children}</SessionHoldContext.Provider>;
}

/** The held-session row a bar shows under itself; the state lives in `SessionHoldProvider`. */
export function SessionHoldBanner() {
	const hold = React.useContext(SessionHoldContext);
	const t = useT();
	if (!hold) return null;
	const { syncBacklogSales, login } = hold;

	return (
		<View
			testID="session-hold-banner"
			className="border-destructive/40 bg-destructive/10 flex-row items-center gap-2 rounded-md border p-2"
		>
			<Text className="text-destructive flex-1 text-sm">
				{syncBacklogSales > 0
					? t('auth.sales_waiting_to_sync', { count: syncBacklogSales })
					: t('auth.session_expired')}
			</Text>
			<Pressable testID="session-hold-login" onPress={login}>
				<Text className="text-destructive web:hover:opacity-80 text-sm font-medium underline">
					{t('auth.log_in')}
				</Text>
			</Pressable>
		</View>
	);
}
