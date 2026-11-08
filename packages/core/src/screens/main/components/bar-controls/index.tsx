import * as React from 'react';

import { useNavigation } from 'expo-router';

import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
// The strip's context alone: the surface module brings the safe-area ESM into every bar's suite.
import { useTitleBarStrip } from '@wcpos/components/edge-surface/title-bar-strip';
import { useIsPhone } from '@wcpos/components/lib/device';
import { OverlayHostProvider } from '@wcpos/components/lib/overlay-host';

import { useT } from '../../../../contexts/translations';
import { useCurrentOrderOptional } from '../../pos/contexts/current-order/context';
import { CashierEntry } from '../cashier-entry';
import { usePageSheetHost } from '../page-sheet-host';
import { NotificationBell } from '../notification-bell/notification-bell';

/**
 * What every bar draws besides its own title and actions: the drawer's menu below `lg`, the online
 * status, the bell and the cashier entry. `PageBar` (through `ManagementBar`) and the POS
 * `RegisterBar` (in its own 48 frame, ruled 2026-09-11) read the same three answers here.
 */
export function useBarMenu(): { label: string; onPress: () => void } | undefined {
	const phone = useIsPhone();
	const navigation = useNavigation();
	const t = useT();
	// On `lg` the rail is always on screen: there is no drawer to open.
	if (!phone) return undefined;
	return {
		label: t('common.menu'),
		onPress: () => (navigation as unknown as { openDrawer: () => void }).openDrawer(),
	};
}

/**
 * The online status in its one form: a named state is a `StatusBadge` (CODING_STANDARDS § Design,
 * Chips, badges and switches) reading Offline, in the warning tone, because red on a till means a
 * loss (§ 7). `undefined` while the store answers.
 */
export function useOnlineBadge(): { label: string; variant: 'warning' } | undefined {
	const status = useOnlineStatus().status;
	const t = useT();
	// An unreachable store reads Offline too: the badge names the cashier's state, not a diagnosis.
	if (status === 'offline' || status === 'online-website-unavailable')
		return { label: t('common.status_offline'), variant: 'warning' };
	return undefined;
}

/** A bar's Offline badge: none while the desktop title bar shows, where it rides with the avatar. */
export function useBarStatus(): ReturnType<typeof useOnlineBadge> {
	const status = useOnlineBadge();
	return useTitleBarStrip().height > 0 ? undefined : status;
}

/** The bar's trailing pair: the bell, then the cashier entry, on every size (the rail lists pages only). */
export function BarControls({
	testID,
	onOpenRegister,
	inTitleBar = false,
}: {
	/** The bar's testID: the bell is `<testID>-bell`, the avatar `<testID>-avatar`. */
	testID: string;
	/** The register bar's: the cashier sheet's drawer figure opens its panel (the one door). */
	onOpenRegister?: (pane?: 'register' | 'count') => void;
	/** The desktop title bar's own pair (`TitleBarStripContent`). */
	inTitleBar?: boolean;
}) {
	const pageHost = usePageSheetHost();
	// While the desktop title bar shows it is the one home of the bell and the avatar on the
	// window (Paul, 2026-10-29): every other bar draws neither. Full screen (0) gives them back.
	const titleBarShown = useTitleBarStrip().height > 0;
	const inTill = useCurrentOrderOptional() !== undefined;
	// The bell and cashier sheet take the bar's host: the till's `pos`, else the page's, beside the
	// rail on wide (#3061) and the root on a phone.
	if (titleBarShown && !inTitleBar) {
		// A till bar keeps the sheet's host, avatarless: the title bar's requests open it with the order.
		return inTill ? (
			<CashierEntry testID={`${testID}-avatar`} onOpenRegister={onOpenRegister} headless />
		) : null;
	}
	const controls = (
		<>
			<NotificationBell testID={`${testID}-bell`} bare={inTitleBar} />
			<CashierEntry testID={`${testID}-avatar`} onOpenRegister={onOpenRegister} bare={inTitleBar} />
		</>
	);
	// The title bar sits above every screen, outside any host: its pair takes the focused page's
	// host, never the root, which would cover the rail (Greptile, #3419).
	return inTitleBar ? (
		<OverlayHostProvider name={pageHost}>{controls}</OverlayHostProvider>
	) : (
		controls
	);
}
