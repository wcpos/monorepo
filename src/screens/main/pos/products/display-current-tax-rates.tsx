import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import useTaxRates from '../../contexts/tax-rates';

const DisplayCurrentTaxRates = () => {
	const { data: rates, query$ } = useTaxRates();
	const query = useObservableState(query$, query$.value);

	return (
		<Box space="normal" padding="small">
			<Box horizontal space="normal">
				<Box>
					<Text uppercase size="small" type="secondary">
						Country
					</Text>
					<Text>{query.country}</Text>
				</Box>
				<Box>
					<Text uppercase size="small" type="secondary">
						State
					</Text>
					<Text>{query.state}</Text>
				</Box>
				<Box>
					<Text uppercase size="small" type="secondary">
						City
					</Text>
					<Text>{query.city}</Text>
				</Box>
				<Box>
					<Text uppercase size="small" type="secondary">
						Postcode
					</Text>
					<Text>{query.postcode}</Text>
				</Box>
			</Box>
			<Box>
				<Text uppercase size="small" type="secondary">
					Matched Rates
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
