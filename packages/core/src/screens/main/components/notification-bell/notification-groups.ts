import type { Notification } from '../../../../contexts/novu';

export type NotificationListItem =
	| { type: 'band'; id: string; label: string }
	| { type: 'row'; id: string; notification: Notification };

export function groupByRecency(
	notifications: Notification[],
	now: number,
	labels: { today: string; earlier: string }
): NotificationListItem[] {
	const items: NotificationListItem[] = [];
	let previous: string | undefined;
	for (const notification of notifications) {
		const group = now - notification.createdAt < 24 * 60 * 60 * 1000 ? 'today' : 'earlier';
		if (group !== previous) items.push({ type: 'band', id: group, label: labels[group] });
		items.push({ type: 'row', id: notification.id, notification });
		previous = group;
	}
	return items;
}
