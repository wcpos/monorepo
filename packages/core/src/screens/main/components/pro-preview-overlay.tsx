import * as React from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { BlurView } from 'expo-blur';

import { Button } from '@wcpos/components/button';
import { Card, CardContent } from '@wcpos/components/card';
import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { openExternalURL } from '@wcpos/utils/open-external-url';

import { useT } from '../../../contexts/translations';

type ProPage = 'products' | 'orders' | 'customers' | 'reports';

interface Props {
	page: ProPage;
	blurTarget?: React.RefObject<View | null>;
}

interface PageConfig {
	description: string;
	demoURL: string;
}

function getPageConfig(page: ProPage, t: ReturnType<typeof useT>): PageConfig {
	switch (page) {
		case 'products':
			return {
				description: t('upgrade.adjust_product_prices_and_quantities_by'),
				demoURL: 'https://demo.wcpos.com/pos/products',
			};
		case 'orders':
			return {
				description: t('upgrade.re-open_and_print_receipts_for_older'),
				demoURL: 'https://demo.wcpos.com/pos/orders',
			};
		case 'customers':
			return {
				description: t('upgrade.add_new_customers_and_edit_existing'),
				demoURL: 'https://demo.wcpos.com/pos/customers',
			};
		case 'reports':
			return {
				description: t('upgrade.unlock_end_of_day_reports_by'),
				demoURL: 'https://demo.wcpos.com/pos/reports',
			};
		default: {
			const _exhaustive: never = page;
			return _exhaustive;
		}
	}
}

export function ProPreviewOverlay({ page, blurTarget }: Props) {
	const t = useT();
	const { description, demoURL } = getPageConfig(page, t);

	return (
		<View style={StyleSheet.absoluteFill} pointerEvents="box-none">
			<BlurView
				intensity={70}
				tint="light"
				blurReductionFactor={4}
				blurMethod="dimezisBlurViewSdk31Plus"
				{...(Platform.OS === 'android' && blurTarget ? { blurTarget } : {})}
				style={StyleSheet.absoluteFill}
			/>
			<View style={styles.ctaContainer} pointerEvents="box-none">
				<Card className="max-w-sm shadow-lg">
					<CardContent className="p-6">
						<VStack className="items-center gap-4">
							<Text testID="upgrade-title" className="text-xl font-bold">
								{t('common.upgrade_to_pro')}
							</Text>
							<Text className="text-muted-foreground text-center">{description}</Text>
							<HStack className="gap-2">
								<Button
									testID="view-demo-button"
									variant="secondary"
									onPress={() => openExternalURL(demoURL)}
								>
									{t('upgrade.view_demo')}
								</Button>
								<Button
									testID="upgrade-to-pro-button"
									onPress={() => openExternalURL('https://wcpos.com/pro')}
								>
									{t('common.upgrade_to_pro')}
								</Button>
							</HStack>
						</VStack>
					</CardContent>
				</Card>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	ctaContainer: {
		...StyleSheet.absoluteFillObject,
		justifyContent: 'center',
		alignItems: 'center',
	},
});
