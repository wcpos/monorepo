import * as React from 'react';
import { View, Linking } from 'react-native';

import { Button } from '@wcpos/components/src/button';
import { HStack } from '@wcpos/components/src/hstack';
import { Image } from '@wcpos/components/src/image';
import { cn } from '@wcpos/components/src/lib/utils';
import { Text } from '@wcpos/components/src/text';
import { VStack } from '@wcpos/components/src/vstack';

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
					title: t('Upgrade to Pro', { _tags: 'core' }),
					description: t(
						'Adjust product prices and quantities by upgrading to WooCommerce POS Pro',
						{
							_tags: 'core',
						}
					),
					demoURL: 'https://demo.wcpos.com/pos/products',
				};
			case 'orders':
				return {
					imageURL: 'https://wcpos.com/orders-upgrade.png',
					title: t('Upgrade to Pro', { _tags: 'core' }),
					description: t(
						'Re-open and print receipts for older orders by upgrading to WooCommerce POS Pro',
						{
							_tags: 'core',
						}
					),
					demoURL: 'https://demo.wcpos.com/pos/orders',
				};
			case 'customers':
				return {
					imageURL: 'https://wcpos.com/customers-upgrade.png',
					title: t('Upgrade to Pro', { _tags: 'core' }),
					description: t(
						'Add new customers and edit existing customers by upgrading to WooCommerce POS Pro',
						{
							_tags: 'core',
						}
					),
					demoURL: 'https://demo.wcpos.com/pos/customers',
				};
			case 'reports':
				return {
					imageURL: 'https://wcpos.com/reports-upgrade.png',
					title: t('Upgrade to Pro', { _tags: 'core' }),
					description: t('Unlock End of Day Reports by upgrading to WooCommerce POS Pro', {
						_tags: 'core',
					}),
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
			<View className="w-full flex-col sm:flex-row max-w-xl sm:max-w-2xl lg:max-w-4xl">
				<View className="w-full sm:w-1/2">
					<View className={cn('relative w-full', page !== 'reports' && 'drop-shadow-md')}>
						<View className="pb-[100%] w-full" />
						<Image source={imageURL} className="absolute top-0 left-0 w-full h-full" />
					</View>
				</View>
				<VStack className="w-full sm:w-1/2 p-4 space-y-4">
					<Text className="text-2xl font-bold text-center sm:text-left">{title}</Text>
					<Text className="text-center sm:text-left">{description}</Text>
					<HStack className="space-x-2 justify-center sm:justify-start">
						<Button variant="secondary" onPress={() => Linking.openURL(demoURL)}>
							{t('View Demo', { _tags: 'core' })}
						</Button>
						<Button onPress={() => Linking.openURL('https://wcpos.com/pro')}>
							{t('Upgrade to Pro', { _tags: 'core' })}
						</Button>
					</HStack>
				</VStack>
			</View>
		</View>
	);
};
