import { useT } from '@wcpos/core/contexts/translations';
import { useStoreSession } from '@wcpos/core/contexts/app-state';
import { getDisplaySignaling } from '@wcpos/core/screens/main/display/store';
import type { NavigationAreaItem } from '@wcpos/core/screens/main/components/navigation-area';

export function useSettingsNavigationItems(): NavigationAreaItem[] {
	const t = useT();
	const { store } = useStoreSession();
	// Typed as an item so the href is checked against Expo's typed routes.
	const customerDisplay: NavigationAreaItem | null = getDisplaySignaling(store)
		? {
				href: '/settings/customer-display',
				label: t('settings.customer_display'),
				testID: 'settings-customer-display-nav',
			}
		: null;

	return [
		{
			href: '/settings/general',
			label: t('settings.general'),
			testID: 'settings-nav-general',
		},
		{
			href: '/settings/tax',
			label: t('settings.tax'),
			testID: 'settings-nav-tax',
		},
		{
			href: '/settings/printing',
			label: t('settings.printing'),
			testID: 'settings-nav-printing',
		},
		...(customerDisplay ? [customerDisplay] : []),
		{
			href: '/settings/barcode-scanning',
			label: t('settings.barcode_scanning'),
			testID: 'settings-nav-barcode-scanning',
		},
		{
			href: '/settings/theme',
			label: t('settings.theme'),
			testID: 'settings-nav-theme',
		},
	];
}
