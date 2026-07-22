import { useT } from '@wcpos/core/contexts/translations';
import type { NavigationAreaItem } from '@wcpos/core/screens/main/components/navigation-area';

export function useSettingsNavigationItems(): NavigationAreaItem[] {
	const t = useT();

	return [
		{
			href: '/settings/general',
			label: t('settings.general', 'General'),
			icon: 'sliders',
			testID: 'settings-nav-general',
		},
		{
			href: '/settings/tax',
			label: t('settings.tax', 'Tax'),
			icon: 'percent',
			testID: 'settings-nav-tax',
		},
		{
			href: '/settings/printing',
			label: t('settings.printing', 'Printing'),
			icon: 'printer',
			testID: 'settings-nav-printing',
		},
		{
			href: '/settings/barcode-scanning',
			label: t('settings.barcode_scanning'),
			icon: 'barcodeScan',
			testID: 'settings-nav-barcode-scanning',
		},
		{
			href: '/settings/theme',
			label: t('settings.theme'),
			icon: 'circleHalfStroke',
			testID: 'settings-nav-theme',
		},
	];
}
