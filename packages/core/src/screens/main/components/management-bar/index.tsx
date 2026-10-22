import * as React from 'react';

import { useNavigation } from 'expo-router';

import { Button } from '@wcpos/components/button';
import { PageBar } from '@wcpos/components/page-bar';
import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import { useDocField } from '@wcpos/query';

import { useStoreSession } from '../../../../contexts/app-state';
import { useTheme } from '../../../../contexts/theme';
import { useT } from '../../../../contexts/translations';
import { peekRedirectLoginUrl } from '../../../../hooks/use-wcpos-auth/redirect-result';
import { CashierSheetProvider, useCashierSheet } from '../../pos/cart/cashier-sheet-state';
import { SessionHoldBanner } from '../session-hold-banner';
import { requestRegisterPicker } from '../../pos/cart/register-picker-request';
import { UserSheet } from '../../pos/cart/user-sheet';
import { NotificationBell } from '../notification-bell/notification-bell';
import { UserAvatar } from '../user-avatar';

type Props = React.PropsWithChildren<{
	title?: string;
	/** A scoped room's scope control in the title's place (Reports). */
	titleSlot?: React.ReactNode;
	testID: string;
	search?: React.ReactNode;
	back?: React.ComponentProps<typeof PageBar>['back'];
}>;

export function ManagementBar(props: Props) {
	const { site } = useStoreSession();
	return (
		<CashierSheetProvider initialOpen={() => peekRedirectLoginUrl() === site.wcpos_login_url}>
			<ManagementBarContent {...props} />
		</CashierSheetProvider>
	);
}

function ManagementBarContent({ title, titleSlot, testID, search, back, children }: Props) {
	const { screenSize } = useTheme();
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
				titleSlot={titleSlot}
				testID={testID}
				back={back}
				status={badge}
				search={search}
				onMenu={
					screenSize !== 'lg'
						? {
								label: t('common.menu'),
								onPress: () => (navigation as unknown as { openDrawer: () => void }).openDrawer(),
							}
						: undefined
				}
			>
				{children}
				<NotificationBell testID={`${testID}-bell`} />
				{screenSize !== 'lg' && (
					<Button
						variant="ghost"
						className="aspect-square px-0"
						testID={`${testID}-avatar`}
						onPress={() => setUserOpen(true)}
					>
						<UserAvatar wpCredentials={wpCredentials} displayName={displayName} />
					</Button>
				)}
			</PageBar>
			{/* Under the bar (and its phone search row), where the drawer header showed it: a held session is a state. */}
			<SessionHoldBanner />
			{/* The root host, as the rail's: the POS host sits inside the POS screen, which is
			    hidden (web) or detached (native) while a management page is on screen. */}
			{/* The one cashier surface carries the same rows on every screen (ruling 2026-10-16,
			    decision 6): Switch register raises the same request the rail's sheet does. */}
			<UserSheet
				open={userOpen}
				onOpenChange={setUserOpen}
				portalHost={null}
				onSwitchRegister={requestRegisterPicker}
			/>
		</>
	);
}
