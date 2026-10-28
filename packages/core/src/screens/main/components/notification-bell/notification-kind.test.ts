import { actionUrl, kindOf } from './notification-kind';

it.each([
	['welcome', { icon: 'wave', tone: 'neutral', labelKey: 'notifications.kind_welcome' }],
	[
		'plugin-update',
		{
			icon: 'download',
			tone: 'info',
			labelKey: 'notifications.kind_plugin_update',
			action: 'update-plugin',
		},
	],
	[
		'license-expiring',
		{ icon: 'warning', tone: 'warn', labelKey: 'notifications.kind_license', action: 'renew' },
	],
	[
		'license-expired',
		{ icon: 'alert', tone: 'bad', labelKey: 'notifications.kind_license', action: 'renew' },
	],
	['announcement', { icon: 'info', tone: 'info', labelKey: 'notifications.kind_announcement' }],
])('maps %s to its kind and permitted action', (id, expected) => {
	expect(kindOf(id as string)).toEqual(expected);
});

it.each([null, undefined, 'something-else'])('uses a neutral kind with no action for %s', (id) => {
	expect(kindOf(id)).toEqual({ icon: 'notifications', tone: 'neutral' });
});

it('opens the plugin admin on the current site', () => {
	expect(actionUrl('update-plugin', 'https://x.test')).toBe('https://x.test/wp-admin/plugins.php');
});

it('opens renewals on WCPOS', () => {
	expect(actionUrl('renew', '')).toBe('https://wcpos.com/pro');
});
