import type { Notification } from '../../../../contexts/novu';

export type NotificationListItem =
	| { type: 'band'; id: string; label: string }
	| { type: 'row'; id: string; notification: Notification };

/** Group newest-first notifications at the start of the current store day (epoch ms). */
export function groupByRecency(
	notifications: Notification[],
	startOfToday: number,
	labels: { today: string; earlier: string }
): NotificationListItem[] {
	const items: NotificationListItem[] = [];
	let previous: string | undefined;
	for (const notification of notifications) {
		const group = notification.createdAt >= startOfToday ? 'today' : 'earlier';
		if (group !== previous) items.push({ type: 'band', id: group, label: labels[group] });
		items.push({ type: 'row', id: notification.id, notification });
		previous = group;
	}
	return items;
}
