import { groupByRecency } from './notification-groups';

import type { Notification } from '../../../../contexts/novu';

const now = 200_000_000;
const labels = { today: 'Today', earlier: 'Earlier' };
const row = (id: string, createdAt: number): Notification => ({
	id,
	createdAt,
	title: id,
	body: '',
	status: 'unread',
	seen: false,
});

it('groups newest-first rows into Today and Earlier bands', () => {
	const notifications = [row('a', now), row('b', now - 86_399_999), row('c', now - 86_400_000)];
	expect(groupByRecency(notifications, now, labels)).toEqual([
		{ type: 'band', id: 'today', label: 'Today' },
		{ type: 'row', id: 'a', notification: notifications[0] },
		{ type: 'row', id: 'b', notification: notifications[1] },
		{ type: 'band', id: 'earlier', label: 'Earlier' },
		{ type: 'row', id: 'c', notification: notifications[2] },
	]);
});

it('emits no Today band for all-old input', () => {
	const notification = row('old', 0);
	expect(groupByRecency([notification], now, labels)).toEqual([
		{ type: 'band', id: 'earlier', label: 'Earlier' },
		{ type: 'row', id: 'old', notification },
	]);
});

it('emits no bands for empty input', () => {
	expect(groupByRecency([], now, labels)).toEqual([]);
});
