import * as React from 'react';
import { View } from 'react-native';

import { useNavigation } from 'expo-router';

import { Button } from '@wcpos/components/button';
import { useIsPhone } from '@wcpos/components/lib/device';
import { PageBar, type PageBarProps } from '@wcpos/components/page-bar';
import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import { useDocField } from '@wcpos/query';

import { useStoreSession } from '../../../../contexts/app-state';
import { useTheme } from '../../../../contexts/theme';
import { useT } from '../../../../contexts/translations';
import { peekRedirectLoginUrl } from '../../../../hooks/use-wcpos-auth/redirect-result';
import { CashierSheetProvider, useCashierSheet } from '../../pos/cart/cashier-sheet-state';
import { UserSheet } from '../../pos/cart/user-sheet';
import { NotificationBell } from '../notification-bell/notification-bell';
import { UserAvatar } from '../user-avatar';

type Props = React.PropsWithChildren<{
	title: string;
	testID: string;
	// Absent on a page with nothing to search (Settings): the slot renders nothing.
	search?: React.ReactNode;
	back?: PageBarProps['back'];
}>;

export function ManagementBar(props: Props) {
	const { site } = useStoreSession();
	return (
		<CashierSheetProvider initialOpen={() => peekRedirectLoginUrl() === site.wcpos_login_url}>
			<ManagementBarContent {...props} />
		</CashierSheetProvider>
	);
}

function ManagementBarContent({ title, testID, search, back, children }: Props) {
	const { screenSize } = useTheme();
	const phone = useIsPhone();
	const navigation = useNavigation();
	const t = useT();
	const { wpCredentials } = useStoreSession();
	const displayName = useDocField(wpCredentials, (value) => value.display_name) as string;
	const { open: userOpen, setOpen: setUserOpen } = useCashierSheet();
	const status = useOnlineStatus().status;
	const badge =
		status === 'offline'
			? { label: t('common.status_offline'), variant: 'error' as const }
			: status === 'online-website-unavailable'
				? { label: t('common.status_site_unreachable'), variant: 'warning' as const }
				: undefined;
	return (
		<>
			<PageBar
				title={title}
				testID={testID}
				status={badge}
				back={back}
				onMenu={
					screenSize !== 'lg'
						? {
								label: t('common.menu'),
								onPress: () => (navigation as unknown as { openDrawer: () => void }).openDrawer(),
							}
						: undefined
				}
			>
				{!phone && search && <View className="max-w-80 min-w-0 flex-1">{search}</View>}
				{children}
				<NotificationBell testID={`${testID}-bell`} />
				{screenSize !== 'lg' && (
					<Button
						variant="ghost"
						className="h-11 w-11 p-0"
						testID={`${testID}-avatar`}
						onPress={() => setUserOpen(true)}
					>
						<UserAvatar wpCredentials={wpCredentials} displayName={displayName} />
					</Button>
				)}
			</PageBar>
			{phone && search && (
				<View className="h-ctl border-border justify-center border-b px-2">{search}</View>
			)}
			<UserSheet open={userOpen} onOpenChange={setUserOpen} />
		</>
	);
}
