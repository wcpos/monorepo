import * as React from 'react';

import { useNavigation } from 'expo-router';

import { useOnlineStatus } from '@wcpos/hooks/use-online-status';

import { useTheme } from '../../../../contexts/theme';
import { useT } from '../../../../contexts/translations';
import { CashierEntry } from '../cashier-entry';
import { NotificationBell } from '../notification-bell/notification-bell';

/**
 * What every bar draws besides its own title and actions: the drawer's menu below `lg`, the online
 * status, the bell and the cashier entry. `PageBar` (through `ManagementBar`) and the POS
 * `RegisterBar` (in its own 48 frame, ruled 2026-09-11) read the same three answers here.
 */
export function useBarMenu(): { label: string; onPress: () => void } | undefined {
	const { screenSize } = useTheme();
	const navigation = useNavigation();
	const t = useT();
	// On `lg` the rail is always on screen: there is no drawer to open.
	if (screenSize === 'lg') return undefined;
	return {
		label: t('common.menu'),
		onPress: () => (navigation as unknown as { openDrawer: () => void }).openDrawer(),
	};
}

/**
 * The online status in its one form: a named state is a `StatusBadge` (CODING_STANDARDS § Design,
 * Chips, badges and switches), in the warning tone, because red on a till means a loss (§ 7).
 * `undefined` while the store answers.
 */
export function useOnlineBadge(): { label: string; variant: 'warning' } | undefined {
	const status = useOnlineStatus().status;
	const t = useT();
	if (status === 'offline') return { label: t('common.status_offline'), variant: 'warning' };
	if (status === 'online-website-unavailable')
		return { label: t('common.status_site_unreachable'), variant: 'warning' };
	return undefined;
}

/** The bar's trailing pair: the bell, then the cashier entry where the rail does not carry it. */
export function BarControls({
	testID,
	portalHost = null,
	onSwitchRegister,
}: {
	/** The bar's testID: the bell is `<testID>-bell`, the avatar `<testID>-avatar`. */
	testID: string;
	/** The POS host inside the till; the root everywhere else. */
	portalHost?: string | null;
	onSwitchRegister?: () => void;
}) {
	const { screenSize } = useTheme();
	return (
		<>
			<NotificationBell testID={`${testID}-bell`} portalHost={portalHost ?? undefined} />
			{screenSize !== 'lg' && (
				<CashierEntry
					testID={`${testID}-avatar`}
					placement="bar"
					portalHost={portalHost}
					onSwitchRegister={onSwitchRegister}
				/>
			)}
		</>
	);
}
