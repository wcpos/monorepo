import * as React from 'react';

import { useNavigation } from '@react-navigation/native';
import isEmpty from 'lodash/isEmpty';

import Box from '@wcpos/components/src/box';
import InlineError from '@wcpos/components/src/inline-error';
import { TaxRateDocument } from '@wcpos/database';
import { Button, ButtonText } from '@wcpos/tailwind/src/button';
import { SimpleTable } from '@wcpos/tailwind/src/simple-table';
import { Text } from '@wcpos/tailwind/src/text';

import { useT } from '../../../../../contexts/translations';

interface DisplayCurrentTaxRatesProps {
	rates: TaxRateDocument[];
	country: string;
	state: string;
	city: string;
	postcode: string;
}

/**
 *
 */
const DisplayCurrentTaxRates = ({
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
		<Box space="normal" padding="small">
			<Box space="xSmall" style={{ width: '100%' }}>
				<Text className="font-bold">{t('Calculate tax based on', { _tags: 'core' })}:</Text>
				<SimpleTable
					columns={[
						{ key: 'country', label: t('Country', { _tags: 'core' }) },
						{ key: 'state', label: t('State', { _tags: 'core' }) },
						{ key: 'city', label: t('City', { _tags: 'core' }) },
						{ key: 'postcode', label: t('Postcode', { _tags: 'core' }) },
					]}
					data={[
						{
							country: country || '-',
							state: state || '-',
							city: city || '-',
							postcode: postcode || '-',
						},
					]}
				/>
			</Box>
			<Box space="xSmall" style={{ width: '100%' }}>
				<Text className="font-bold">{t('Matched rates', { _tags: 'core' })}:</Text>
				{Array.isArray(rates) && rates.length > 0 ? (
					<SimpleTable
						columns={[
							{ key: 'name', label: t('Name', { _tags: 'core' }) },
							{ key: 'rate', label: t('Rate', { _tags: 'core' }) },
							{ key: 'class', label: t('Class', { _tags: 'core', _context: 'tax class' }) },
						]}
						data={rates}
					/>
				) : (
					<InlineError message={t('No rates matched', { _tags: 'core' })} />
				)}
			</Box>
			<Box horizontal>
				<Button
					variant="secondary"
					onPress={() => {
						navigation.navigate('TaxRates');
					}}
				>
					<ButtonText>{t('View all tax rates', { _tags: 'core' })}</ButtonText>
				</Button>
			</Box>
		</Box>
	);
};

export default DisplayCurrentTaxRates;
