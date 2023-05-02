import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import { t } from '../../../../../lib/translations';
import useTaxRates from '../../../contexts/tax-rates';

const DisplayCurrentTaxRates = () => {
	const { data: rates, query$ } = useTaxRates();
	const query = useObservableState(query$, query$.value);

	return (
		<Box space="normal" padding="small">
			<Box horizontal space="normal">
				<Box>
					<Text uppercase size="small" type="secondary">
						{t('Country', { _tags: 'core' })}
					</Text>
					<Text>{query.country}</Text>
				</Box>
				<Box>
					<Text uppercase size="small" type="secondary">
						{t('State', { _tags: 'core' })}
					</Text>
					<Text>{query.state}</Text>
				</Box>
				<Box>
					<Text uppercase size="small" type="secondary">
						{t('City', { _tags: 'core' })}
					</Text>
					<Text>{query.city}</Text>
				</Box>
				<Box>
					<Text uppercase size="small" type="secondary">
						{t('Postcode', { _tags: 'core' })}
					</Text>
					<Text>{query.postcode}</Text>
				</Box>
			</Box>
			<Box>
				<Text uppercase size="small" type="secondary">
					{t('Matched Rates', { _tags: 'core' })}
				</Text>
				{rates.map((rate) => {
					return (
						<Box key={rate.id} horizontal space="normal" style={{ width: '100%' }}>
							<Box style={{ flex: 1 }}>
								<Text>{rate.name}</Text>
							</Box>
							<Box style={{ flex: 1 }}>
								<Text>{rate.rate}</Text>
							</Box>
							<Box style={{ flex: 1 }}>
								<Text>{rate.class}</Text>
							</Box>
						</Box>
					);
				})}
			</Box>
		</Box>
	);
};

export default DisplayCurrentTaxRates;
