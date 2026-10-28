import * as React from 'react';
import { View } from 'react-native';

import { Button } from '@wcpos/components/button';
import { DialogBody, DialogFooter, DialogHeader, DialogTitle } from '@wcpos/components/dialog';
import { EmptyState } from '@wcpos/components/empty-state';
import { Icon } from '@wcpos/components/icon';
import { cn } from '@wcpos/components/lib/utils';
import { ListRow } from '@wcpos/components/list-row';
import { Notice } from '@wcpos/components/notice';
import { Skeleton } from '@wcpos/components/skeleton';
import { Text } from '@wcpos/components/text';
import { useDocField } from '@wcpos/query';
import { openExternalURL } from '@wcpos/utils/open-external-url';

import { useAppState } from '../../../../contexts/app-state';
import { type Notification, useNovuNotifications } from '../../../../contexts/novu';
import { useT } from '../../../../contexts/translations';
import { storeDayBounds, useStoreDay } from '../../../../hooks/use-store-day';
import { useDateFormat } from '../../hooks/use-date-format';
import { groupByRecency, type NotificationListItem } from './notification-groups';
import { actionUrl, kindOf } from './notification-kind';

const TONES = {
	info: { tile: 'bg-info/10', icon: 'text-info' },
	warn: { tile: 'bg-warn-bg', icon: 'text-warn-text' },
	bad: { tile: 'bg-bad-bg', icon: 'text-bad' },
	neutral: { tile: 'bg-muted', icon: 'text-foreground' },
};

function NotificationItem({
	notification,
	onMarkAsRead,
	siteUrl,
}: {
	notification: Notification;
	onMarkAsRead: (id: string) => void;
	siteUrl: string;
}) {
	const t = useT();
	const unread = notification.status === 'unread';
	const timeAgo = useDateFormat(notification.createdAt);
	const kind = kindOf(notification.workflowId);
	const tone = TONES[kind.tone];
	const kindLabel = kind.labelKey ? t(kind.labelKey) : '';
	const handlePress = () => {
		if (unread) onMarkAsRead(notification.id);
	};

	return (
		<ListRow
			size="default"
			className="items-start"
			bodyClassName="gap-1"
			testID={`notification-row-${notification.id}`}
			onPress={handlePress}
			leading={
				<View className={cn('h-9 w-9 items-center justify-center rounded-lg', tone.tile)}>
					<Icon name={kind.icon} size="sm" className={tone.icon} />
				</View>
			}
			trailing={<View className={cn('bg-primary h-2 w-2 rounded-full', !unread && 'opacity-0')} />}
		>
			<Text className={cn(unread && 'font-semibold')}>{notification.title}</Text>
			{!!notification.body && (
				<Text className="text-muted-foreground text-sm">{notification.body}</Text>
			)}
			<Text className="text-muted-foreground text-xs">
				{[kindLabel, timeAgo].filter(Boolean).join(' · ')}
			</Text>
			{kind.action && (
				<Button
					variant="outline"
					size="sm"
					className="self-start"
					leftIcon="openExternal"
					testID={`notification-action-${notification.id}`}
					onPress={() => {
						handlePress();
						if (!kind.action || (kind.action === 'update-plugin' && !siteUrl)) return;
						void openExternalURL(actionUrl(kind.action, siteUrl));
					}}
				>
					{kind.action === 'update-plugin'
						? t('notifications.action_update_plugin')
						: t('notifications.action_renew')}
				</Button>
			)}
		</ListRow>
	);
}

export function NotificationPanelContent() {
	const t = useT();
	const { notifications, unreadCount, isLoading, isConnected, markAsRead, markAllAsRead } =
		useNovuNotifications();
	const { site } = useAppState();
	const siteUrl = useDocField(site, (value) => value.url) as string | undefined;
	const { timezone, today } = useStoreDay();
	// Measured when the panel opens; reopening refreshes the bands.
	const [startOfToday] = React.useState(() => storeDayBounds(today(), timezone).from.getTime());
	const items = groupByRecency(notifications, startOfToday, {
		today: t('common.today'),
		earlier: t('notifications.earlier'),
	});
	// Plain rows in the body's own ScrollView: a fetch is 50 rows and the panel opens a few
	// times a month, so a virtualized list (which must not nest in a ScrollView) buys nothing.
	const renderItem = (item: NotificationListItem) =>
		item.type === 'band' ? (
			<View
				key={`band-${item.id}`}
				testID={`notifications-band-${item.id}`}
				className="h-band bg-background border-border justify-center border-b px-3"
			>
				<Text className="text-muted-foreground text-xs tracking-wide uppercase">{item.label}</Text>
			</View>
		) : (
			<NotificationItem
				key={`row-${item.id}`}
				notification={item.notification}
				onMarkAsRead={markAsRead}
				siteUrl={siteUrl ?? ''}
			/>
		);

	return (
		<>
			<DialogHeader>
				<DialogTitle>{t('common.notifications')}</DialogTitle>
			</DialogHeader>
			<DialogBody className="gap-0 px-0">
				{!isConnected && (
					<View className="px-3 pt-2">
						<Notice
							tone="info"
							title={t('notifications.offline_saved')}
							testID="notifications-offline"
						/>
					</View>
				)}
				{notifications.length === 0 ? (
					isLoading ? (
						[0, 1, 2, 3].map((index) => (
							<View
								key={index}
								className="border-border flex-row items-start gap-3 border-b px-3 py-3"
							>
								<Skeleton className="h-9 w-9" />
								<View className="flex-1 gap-2">
									<Skeleton shape="line" className="w-3/5" />
									<Skeleton shape="line" className="w-11/12" />
									<Skeleton shape="line" className="h-2.5 w-1/3" />
								</View>
							</View>
						))
					) : (
						<EmptyState
							kind="empty"
							icon="notifications"
							title={t('common.no_notifications')}
							description={t('notifications.empty_description')}
							docs={{ label: t('notifications.about_link'), href: 'https://docs.wcpos.com/' }}
							testID="notifications-empty"
						/>
					)
				) : (
					<View testID="notifications-list">{items.map(renderItem)}</View>
				)}
			</DialogBody>
			<DialogFooter
				record={
					unreadCount > 0 && {
						label: t('common.mark_all_as_read'),
						onPress: () => void markAllAsRead(),
						testID: 'notifications-mark-all-read',
					}
				}
				close={{ testID: 'notifications-close' }}
			/>
		</>
	);
}
