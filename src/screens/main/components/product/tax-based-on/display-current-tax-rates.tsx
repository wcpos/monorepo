import * as React from 'react';

import { useNavigation } from '@react-navigation/native';
import isEmpty from 'lodash/isEmpty';

import Box from '@wcpos/components/src/box';
import Button from '@wcpos/components/src/button';
import InlineError from '@wcpos/components/src/inline-error';
import SimpleTable from '@wcpos/components/src/simple-table';
import Text from '@wcpos/components/src/text';
import { TaxRateDocument } from '@wcpos/database';

import { t } from '../../../../../lib/translations';

interface DisplayCurrentTaxRatesProps {
	rates: TaxRateDocument[];
	country: string;
	state: string;
	city: string;
	postcode: string;
	setOpened: React.Dispatch<React.SetStateAction<boolean>>;
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
	setOpened,
}: DisplayCurrentTaxRatesProps) => {
	const navigation = useNavigation();

	/**
	 *
	 */
	return (
		<Box space="normal" padding="small">
			<Box space="xSmall" style={{ width: '100%' }}>
				<Text weight="bold">{t('Calculate tax based on', { _tags: 'core' })}:</Text>
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
				<Text weight="bold">{t('Matched rates', { _tags: 'core' })}:</Text>
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
					type="secondary"
					size="small"
					title={t('View all tax rates', { _tags: 'core' })}
					onPress={() => {
						setOpened(false);
						navigation.navigate('TaxRates');
					}}
				/>
			</Box>
		</Box>
	);
};

export default DisplayCurrentTaxRates;
