import * as React from 'react';

import { useIsPhone } from '@wcpos/components/lib/device';
import { cn } from '@wcpos/components/lib/utils';
import { Notice } from '@wcpos/components/notice';
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

/** Whether a session hold is showing: the row after the banner spaces itself from it. */
export function useSessionHeld(): boolean {
	return React.useContext(SessionHoldContext) != null;
}

/**
 * The held-session row a bar shows under itself; the state lives in `SessionHoldProvider`.
 * On wide widths it is the row under the bar, so it carries the container's gutter above and
 * at its sides (16 on a page, 8 in a dense pane; CODING_STANDARDS § Design, Gutters) — the
 * wide bar ends at its controls and leaves the gutter to its follower. The phone is unchanged.
 */
export function SessionHoldBanner({ gutter = 'page' }: { gutter?: 'page' | 'dense' }) {
	const hold = React.useContext(SessionHoldContext);
	const t = useT();
	const phone = useIsPhone();
	if (!hold) return null;
	const { syncBacklogSales, login } = hold;

	return (
		<Notice
			tone="bad"
			title={
				syncBacklogSales > 0
					? t('auth.sales_waiting_to_sync_title', { count: syncBacklogSales })
					: t('auth.session_expired_title')
			}
			description={
				syncBacklogSales > 0
					? t('auth.sales_waiting_to_sync_description')
					: t('auth.session_expired_description')
			}
			actions={[{ label: t('auth.log_in'), onPress: login, testID: 'session-hold-login' }]}
			className={cn(!phone && (gutter === 'page' ? 'mx-4 mt-4' : 'mx-2 mt-2'))}
			testID="session-hold-banner"
		/>
	);
}
