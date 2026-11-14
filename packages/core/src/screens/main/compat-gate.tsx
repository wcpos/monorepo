import * as React from 'react';

import { clearSitePluginVersions, type ReadonlySiteRecord } from '@wcpos/query/user-db';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';

import { useAppState } from '../../contexts/app-state';
import { usePluginCompatCheck } from '../../hooks/use-plugin-compat-check';
import { UpgradeRequired } from './upgrade-required';

const compatLogger = getLogger(['wcpos', 'app', 'compat']);

/**
 * The plugin-version compatibility gate. It lives BELOW the engine + QueryProvider
 * (inside AppStack) so that toggling it — the saved version (useSiteInfo) and the
 * live check settle on separate async timelines and transiently disagree during
 * boot — only swaps the gated CONTENT and never unmounts the engine. Previously this
 * gate early-returned in AppLayout, above AppStack, so the toggle remounted AppStack
 * and constructed the engine twice; the second construction collided on the
 * already-open RxDatabase (multiInstance:false) and its scope never became ready,
 * leaving every binding reading an empty engine.
 *
 * It re-checks the live version before it trusts a failing saved one: the saved
 * version comes from the store's REST index, and a cached 1.x answer to that fixed
 * URL kept a 2.0.1 store behind this gate through reloads and re-logins (AUTH331).
 */
export function CompatGate({
	site,
	children,
}: {
	site: ReadonlySiteRecord;
	children: React.ReactNode;
}) {
	const { status, recheck } = usePluginCompatCheck(site);
	const { logout } = useAppState();

	const handleLogout = React.useCallback(async () => {
		try {
			await clearSitePluginVersions(site);
		} catch (error) {
			compatLogger.warn('Could not clear the saved WCPOS plugin version before logout', {
				context: { error: getErrorMessage(error) },
			});
		}
		await logout();
	}, [site, logout]);

	if (status === 'ok') return <>{children}</>;
	return (
		<UpgradeRequired
			checking={status === 'checking'}
			onCheckAgain={recheck}
			onLogout={() => void handleLogout()}
		/>
	);
}
