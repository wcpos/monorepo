import * as React from 'react';

import { useNavigation } from 'expo-router';

import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import { useIsPhone } from '@wcpos/components/lib/device';

import { useT } from '../../../../contexts/translations';
import { CashierEntry } from '../cashier-entry';
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

/** The bar's trailing pair: the bell, then the cashier entry, on every size (the rail lists pages only). */
export function BarControls({
	testID,
	portalHost = null,
	onOpenRegister,
}: {
	/** The bar's testID: the bell is `<testID>-bell`, the avatar `<testID>-avatar`. */
	testID: string;
	/** The POS host inside the till; the root everywhere else. */
	portalHost?: string | null;
	/** The register bar's: the cashier sheet's drawer figure opens its panel (the one door). */
	onOpenRegister?: () => void;
}) {
	return (
		<>
			<NotificationBell testID={`${testID}-bell`} portalHost={portalHost ?? undefined} />
			<CashierEntry
				testID={`${testID}-avatar`}
				portalHost={portalHost}
				onOpenRegister={onOpenRegister}
			/>
		</>
	);
}
