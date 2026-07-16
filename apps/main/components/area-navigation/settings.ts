import { useT } from '@wcpos/core/contexts/translations';
import type { NavigationAreaItem } from '@wcpos/core/screens/main/components/navigation-area';

export function useSettingsNavigationItems(): NavigationAreaItem[] {
	const t = useT();

	return [
		{
			href: '/settings/general',
			label: t('settings.general_settings'),
			testID: 'settings-nav-general',
		},
		{
			href: '/settings/tax',
			label: t('settings.tax_settings'),
			testID: 'settings-nav-tax',
		},
		{
			href: '/settings/printing',
			label: t('settings.printing', 'Printing'),
			testID: 'settings-nav-printing',
		},
		{
			href: '/settings/barcode-scanning',
			label: t('settings.barcode_scanning'),
			testID: 'settings-nav-barcode-scanning',
		},
		{
			href: '/settings/shortcuts',
			label: t('settings.keyboard_shortcuts'),
			testID: 'settings-nav-shortcuts',
		},
		{
			href: '/settings/theme',
			label: t('settings.theme'),
			testID: 'settings-nav-theme',
		},
	];
}
