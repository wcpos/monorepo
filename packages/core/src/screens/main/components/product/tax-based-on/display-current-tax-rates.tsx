import * as React from 'react';
import { View } from 'react-native';

import { useRouter } from 'expo-router';

import { Button, ButtonText } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@wcpos/components/table';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { TaxRateDocument } from '@wcpos/database';

import { useT } from '../../../../../contexts/translations';

interface DisplayCurrentTaxRatesProps {
	rates: TaxRateDocument[];
	country?: string;
	state?: string;
	city?: string;
	postcode?: string;
}

/**
 *
 */
export const DisplayCurrentTaxRates = ({
	rates,
	country,
	state,
	city,
	postcode,
}: DisplayCurrentTaxRatesProps) => {
	const router = useRouter();
	const t = useT();

	/**
	 *
	 */
	return (
		<VStack space="md">
			<VStack>
				<Text className="font-bold">{t('common.calculate_tax_based_on')}:</Text>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>
								<Text>{t('common.country')}</Text>
							</TableHead>
							<TableHead>
								<Text>{t('common.state')}</Text>
							</TableHead>
							<TableHead>
								<Text>{t('common.city')}</Text>
							</TableHead>
							<TableHead>
								<Text>{t('common.postcode')}</Text>
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						<TableRow>
							<TableCell>
								<Text>{country || '-'}</Text>
							</TableCell>
							<TableCell>
								<Text>{state || '-'}</Text>
							</TableCell>
							<TableCell>
								<Text>{city || '-'}</Text>
							</TableCell>
							<TableCell>
								<Text>{postcode || '-'}</Text>
							</TableCell>
						</TableRow>
					</TableBody>
				</Table>
			</VStack>
			<VStack>
				<Text className="font-bold">{t('common.matched_rates')}:</Text>
				{Array.isArray(rates) && rates.length > 0 ? (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>
									<Text>{t('common.name')}</Text>
								</TableHead>
								<TableHead>
									<Text>{t('common.rate')}</Text>
								</TableHead>
								<TableHead>
									<Text>{t('common.class')}</Text>
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rates.map((rate, index) => (
								<TableRow key={rate.id} index={index}>
									<TableCell>
										<Text>{rate.name}</Text>
									</TableCell>
									<TableCell>
										<Text>{rate.rate}</Text>
									</TableCell>
									<TableCell>
										<Text>{rate.class}</Text>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				) : (
					<HStack space="xs">
						<Icon variant="error" name="triangleExclamation" />
						<Text className="text-error text-sm">{t('common.no_rates_matched')}</Text>
					</HStack>
				)}
			</VStack>
			<View className="flex-row">
				<Button
					variant="muted"
					onPress={() => {
						router.push('/(app)/(modals)/tax-rates');
					}}
				>
					<ButtonText>{t('common.view_all_tax_rates')}</ButtonText>
				</Button>
			</View>
		</VStack>
	);
};
