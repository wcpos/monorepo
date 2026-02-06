import * as React from 'react';
import { Linking, View } from 'react-native';

import { Button } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Image } from '@wcpos/components/image';
import { cn } from '@wcpos/components/lib/utils';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { useT } from '../../contexts/translations';

export const PageUpgrade = ({
	page,
}: {
	page: 'products' | 'orders' | 'customers' | 'reports';
}) => {
	const t = useT();

	/**
	 * Get info for the page
	 */
	const { imageURL, title, description, demoURL } = React.useMemo(() => {
		switch (page) {
			case 'products':
				return {
					imageURL: 'https://wcpos.com/products-upgrade.png',
					title: t('common.upgrade_to_pro'),
					description: t('upgrade.adjust_product_prices_and_quantities_by'),
					demoURL: 'https://demo.wcpos.com/pos/products',
				};
			case 'orders':
				return {
					imageURL: 'https://wcpos.com/orders-upgrade.png',
					title: t('common.upgrade_to_pro'),
					description: t('upgrade.re-open_and_print_receipts_for_older'),
					demoURL: 'https://demo.wcpos.com/pos/orders',
				};
			case 'customers':
				return {
					imageURL: 'https://wcpos.com/customers-upgrade.png',
					title: t('common.upgrade_to_pro'),
					description: t('upgrade.add_new_customers_and_edit_existing'),
					demoURL: 'https://demo.wcpos.com/pos/customers',
				};
			case 'reports':
				return {
					imageURL: 'https://wcpos.com/reports-upgrade.png',
					title: t('common.upgrade_to_pro'),
					description: t('upgrade.unlock_end_of_day_reports_by'),
					demoURL: 'https://demo.wcpos.com/pos/reports',
				};
			default:
				return {
					imageURL: '',
					title: '',
					description: '',
					demoURL: '',
				};
		}
	}, [page, t]);

	return (
		<View className="flex-1 items-center justify-center p-4">
			<View className="w-full max-w-xl flex-col sm:max-w-2xl sm:flex-row lg:max-w-4xl">
				<View className="w-full sm:w-1/2">
					<View className={cn('relative w-full', page !== 'reports' && 'drop-shadow-md')}>
						<View className="w-full pb-[100%]" />
						<Image source={imageURL} className="absolute top-0 left-0 h-full w-full" />
					</View>
				</View>
				<VStack className="w-full gap-4 p-4 sm:w-1/2">
					<Text className="text-center text-2xl font-bold sm:text-left">{title}</Text>
					<Text className="text-center sm:text-left">{description}</Text>
					<HStack className="justify-center gap-2 sm:justify-start">
						<Button variant="secondary" onPress={() => Linking.openURL(demoURL)}>
							{t('upgrade.view_demo')}
						</Button>
						<Button onPress={() => Linking.openURL('https://wcpos.com/pro')}>
							{t('common.upgrade_to_pro')}
						</Button>
					</HStack>
				</VStack>
			</View>
		</View>
	);
};
