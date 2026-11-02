import type { IconName } from '@wcpos/components/icon';

import { WORKFLOW_IDS } from '../../../../services/novu/notification-behaviors';

export type NotificationTone = 'info' | 'warn' | 'bad' | 'neutral';
export type NotificationAction = 'update-plugin' | 'renew';
export type NotificationKind = {
	icon: IconName;
	tone: NotificationTone;
	label?: string;
	action?: NotificationAction;
};

export function kindOf(
	workflowId: string | undefined | null,
	t: (key: string) => string
): NotificationKind {
	switch (workflowId) {
		case WORKFLOW_IDS.WELCOME:
			return { icon: 'wave', tone: 'neutral', label: t('notifications.kind_welcome') };
		case WORKFLOW_IDS.PLUGIN_UPDATE:
			return {
				icon: 'download',
				tone: 'info',
				label: t('notifications.kind_plugin_update'),
				action: 'update-plugin',
			};
		case WORKFLOW_IDS.LICENSE_EXPIRING:
			return {
				icon: 'warning',
				tone: 'warn',
				label: t('notifications.kind_license'),
				action: 'renew',
			};
		case WORKFLOW_IDS.LICENSE_EXPIRED:
			return {
				icon: 'alert',
				tone: 'bad',
				label: t('notifications.kind_license'),
				action: 'renew',
			};
		case WORKFLOW_IDS.ANNOUNCEMENT:
			return { icon: 'info', tone: 'info', label: t('notifications.kind_announcement') };
		default:
			return { icon: 'notifications', tone: 'neutral' };
	}
}

export function actionUrl(action: NotificationAction, siteUrl: string): string {
	return action === 'update-plugin' ? `${siteUrl}/wp-admin/plugins.php` : 'https://wcpos.com/pro';
}
