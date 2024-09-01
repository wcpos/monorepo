import * as React from 'react';
import { View } from 'react-native';

import { useNavigation } from '@react-navigation/native';
import isEmpty from 'lodash/isEmpty';

import { Button, ButtonText } from '@wcpos/components/src/button';
import { HStack } from '@wcpos/components/src/hstack';
import { Icon } from '@wcpos/components/src/icon';
import {
	Table,
	TableHeader,
	TableHead,
	TableRow,
	TableCell,
	TableBody,
} from '@wcpos/components/src/table';
import { Text } from '@wcpos/components/src/text';
import { VStack } from '@wcpos/components/src/vstack';
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
	const navigation = useNavigation();
	const t = useT();

	/**
	 *
	 */
	return (
		<VStack space="md">
			<VStack>
				<Text className="font-bold">{t('Calculate tax based on', { _tags: 'core' })}:</Text>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>
								<Text>{t('Country', { _tags: 'core' })}</Text>
							</TableHead>
							<TableHead>
								<Text>{t('State', { _tags: 'core' })}</Text>
							</TableHead>
							<TableHead>
								<Text>{t('City', { _tags: 'core' })}</Text>
							</TableHead>
							<TableHead>
								<Text>{t('Postcode', { _tags: 'core' })}</Text>
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
				<Text className="font-bold">{t('Matched rates', { _tags: 'core' })}:</Text>
				{Array.isArray(rates) && rates.length > 0 ? (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>
									<Text>{t('Name', { _tags: 'core' })}</Text>
								</TableHead>
								<TableHead>
									<Text>{t('Rate', { _tags: 'core' })}</Text>
								</TableHead>
								<TableHead>
									<Text>{t('Class', { _tags: 'core' })}</Text>
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
						<Text className="text-sm text-error">{t('No rates matched', { _tags: 'core' })}</Text>
					</HStack>
				)}
			</VStack>
			<View className="flex-row">
				<Button
					variant="muted"
					onPress={() => {
						navigation.navigate('TaxRates');
					}}
				>
					<ButtonText>{t('View all tax rates', { _tags: 'core' })}</ButtonText>
				</Button>
			</View>
		</VStack>
	);
};
