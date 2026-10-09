import * as React from 'react';
import { View } from 'react-native';

import { useNavigation } from 'expo-router';

import { StatusBadge } from '@wcpos/components/status-badge';
import { Button } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { IconButton } from '@wcpos/components/icon-button';
import { Icon } from '@wcpos/components/icon';
import { Text } from '@wcpos/components/text';
import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import { useDocField } from '@wcpos/query';

import { CashierSheetProvider, useCashierSheet } from './cashier-sheet-state';
import { RegisterPanel } from './register-panel';
import { useRegisterSession } from '../../../../services/register-session/use-register-session';
import { useStoreSession } from '../../../../contexts/app-state';
import { useTheme } from '../../../../contexts/theme';
import { useT } from '../../../../contexts/translations';
import { peekRedirectLoginUrl } from '../../../../hooks/use-wcpos-auth/redirect-result';
import { useRegisterBinding } from '../../../../services/register/use-register-binding';
import { UserAvatar } from '../../components/user-avatar';
import { NotificationBell } from '../../components/notification-bell/notification-bell';
import { describeRegisterBar } from './register-bar.helpers';
import { SwitchStoreSheet } from './switch-store-sheet';
import { UserSheet } from './user-sheet';

// Rehost the Add user consumer after a full-page OAuth return, as Connect does.
export function RegisterBar(props: React.ComponentProps<typeof RegisterBarContent>) {
	const { site } = useStoreSession();
	return (
		<CashierSheetProvider initialOpen={() => peekRedirectLoginUrl() === site.wcpos_login_url}>
			<RegisterBarContent {...props} />
		</CashierSheetProvider>
	);
}

function RegisterBarContent({
	onSwitchRegister,
	panelOpen,
	onPanelOpenChange,
	strip = false,
}: {
	onSwitchRegister?: () => void;
	panelOpen: boolean;
	onPanelOpenChange: (open: boolean) => void;
	/** The desktop's title-bar strip: 40 pt, no frame of its own (the strip is the frame). */
	strip?: boolean;
}) {
	const { session, sessionsOn, overdue, lastClosure } = useRegisterSession();
	const { wpCredentials, store } = useStoreSession();
	const { screenSize } = useTheme();
	const navigation = useNavigation();
	const t = useT();
	const binding = useRegisterBinding();
	const storeName = useDocField(store, (value) => value.name) as string;
	const displayName = useDocField(wpCredentials, (value) => value.display_name) as string;
	const stores = useDocField(wpCredentials, (value) => value.stores) as string[];
	// The store being unreachable reads as offline to a cashier: one pill, one place.
	const status = useOnlineStatus().status;
	const online = status !== 'offline' && status !== 'online-website-unavailable';
	const { place, pill } = describeRegisterBar({
		registerName: binding.registerName,
		registerCount: binding.registers.length,
		storeName,
		bindingStatus: binding.status,
		online,
		sessionsOn,
		sessionStatus: session?.status,
		approvalRequired: session?.approval_required,
		overdue,
	});
	const { open: userOpen, setOpen: setUserOpen } = useCashierSheet();
	const [storeOpen, setStoreOpen] = React.useState(false);
	// The sheets live beside the bar, not in it: a closed Dialog still mounts an empty root,
	// and inside the bar's gap row that root was an invisible 8 pt cell pushing the bell and
	// the drawer icon out of line with the row below (Paul, 2026-10-09).
	return (
		<>
			<HStack
				testID={strip ? 'register-bar-strip' : undefined}
				className={strip ? 'flex-1 gap-2 px-2' : 'border-border h-12 gap-2 border-b px-2'}
			>
				{screenSize !== 'lg' && (
					<Button
						variant="ghost"
						className="h-11 w-11 p-0"
						testID="pos-drawer-open-button"
						aria-label={t('common.menu')}
						onPress={() => (navigation as unknown as { openDrawer: () => void }).openDrawer()}
					>
						<Icon name="bars" />
					</Button>
				)}
				<View className="min-w-0 shrink">
					{stores?.length > 1 ? (
						<Button
							testID="register-bar-store"
							variant="ghost"
							className="h-11 min-w-11 shrink items-start px-0"
							onPress={() => setStoreOpen(true)}
						>
							<Text
								testID="register-bar-place"
								className="text-base font-semibold"
								numberOfLines={1}
							>
								{place}
							</Text>
						</Button>
					) : (
						<Text testID="register-bar-place" className="text-base font-semibold" numberOfLines={1}>
							{place}
						</Text>
					)}
				</View>
				{pill && <StatusBadge testID="register-bar-pill" label={t(pill)} variant="warning" />}
				<View className="flex-1" />
				{(session || lastClosure) && (
					<IconButton
						name="cashRegister"
						testID="register-bar-drawer"
						iconClassName={overdue ? 'text-warning' : 'text-foreground'}
						onPress={() => onPanelOpenChange(true)}
					/>
				)}
				<NotificationBell testID="register-bar-bell" portalHost="pos" />
				{/* The rail carries the avatar only on `lg`; every other layout (the phone, and the
			    medium widths that keep the old front drawer) needs the bar's. */}
				{screenSize !== 'lg' && (
					<Button
						variant="ghost"
						className="h-11 w-11 p-0"
						testID="register-bar-avatar"
						onPress={() => setUserOpen(true)}
					>
						<UserAvatar wpCredentials={wpCredentials} displayName={displayName} />
					</Button>
				)}
			</HStack>
			{panelOpen && <RegisterPanel open={panelOpen} onOpenChange={onPanelOpenChange} />}
			<UserSheet open={userOpen} onOpenChange={setUserOpen} onSwitchRegister={onSwitchRegister} />
			<SwitchStoreSheet open={storeOpen} onOpenChange={setStoreOpen} />
		</>
	);
}
