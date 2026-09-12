import * as React from 'react';
import { View } from 'react-native';

import { useNavigation } from 'expo-router';

import { StatusBadge } from '@wcpos/components/status-badge';
import { Button } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { Text } from '@wcpos/components/text';
import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import { useDocField } from '@wcpos/query';

import { RegisterPanel } from './register-panel';
import { useRegisterSession } from '../../../../services/register-session/use-register-session';
import { useStoreSession } from '../../../../contexts/app-state';
import { useTheme } from '../../../../contexts/theme';
import { useT } from '../../../../contexts/translations';
import { peekRedirectLoginUrl } from '../../../../hooks/use-wcpos-auth/redirect-result';
import { useRegisterBinding } from '../../../../services/register/use-register-binding';
import { UserAvatar } from '../../components/header/user-avatar';
import { describeRegisterBar } from './register-bar.helpers';
import { SwitchStoreSheet } from './switch-store-sheet';
import { UserSheet } from './user-sheet';

export function RegisterBar({
	onSwitchRegister,
	panelOpen,
	onPanelOpenChange,
}: {
	onSwitchRegister?: () => void;
	panelOpen: boolean;
	onPanelOpenChange: (open: boolean) => void;
}) {
	const { session, sessionsOn, overdue } = useRegisterSession();
	const { wpCredentials, store, site } = useStoreSession();
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
	// Rehost the Add user consumer after a full-page OAuth return, as Connect does.
	const [userOpen, setUserOpen] = React.useState(
		() => peekRedirectLoginUrl() === site.wcpos_login_url
	);
	const [storeOpen, setStoreOpen] = React.useState(false);
	return (
		<HStack className="bg-card border-border h-12 gap-2 border-b px-2">
			{screenSize !== 'lg' && (
				<Button
					variant="ghost"
					className="h-11 w-11 p-0"
					testID="pos-drawer-open-button"
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
						<Text testID="register-bar-place" numberOfLines={1}>
							{place}
						</Text>
					</Button>
				) : (
					<Text testID="register-bar-place" numberOfLines={1}>
						{place}
					</Text>
				)}
			</View>
			{pill && <StatusBadge testID="register-bar-pill" label={t(pill)} variant="warning" />}
			<View className="flex-1" />
			{session && (
				<Button
					variant="ghost"
					className="h-11 w-11 p-0"
					testID="register-bar-drawer"
					onPress={() => onPanelOpenChange(true)}
				>
					<Icon name="cashRegister" className={overdue ? 'text-warning' : 'text-foreground'} />
				</Button>
			)}
			{panelOpen && <RegisterPanel open={panelOpen} onOpenChange={onPanelOpenChange} />}
			<Button
				variant="ghost"
				className="h-11 w-11 p-0"
				testID="register-bar-avatar"
				onPress={() => setUserOpen(true)}
			>
				<UserAvatar wpCredentials={wpCredentials} displayName={displayName} />
			</Button>
			<UserSheet open={userOpen} onOpenChange={setUserOpen} onSwitchRegister={onSwitchRegister} />
			<SwitchStoreSheet open={storeOpen} onOpenChange={setStoreOpen} />
		</HStack>
	);
}
