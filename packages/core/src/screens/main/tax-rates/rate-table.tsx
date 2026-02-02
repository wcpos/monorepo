import * as React from 'react';

import { Icon } from '@wcpos/components/src/icon';
import {
	Table,
	TableHeader,
	TableHead,
	TableBody,
	TableRow,
	TableCell,
} from '@wcpos/components/src/table';
import { Text } from '@wcpos/components/src/text';

import { useT } from '../../../contexts/translations';

interface TaxRateTableProps {
	rates: import('@wcpos/database').TaxRateDocument[];
}

/**
 *
 */
export const TaxRateTable = ({ rates }: TaxRateTableProps) => {
	const t = useT();

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>
						<Text>{t('Country code')}</Text>
					</TableHead>
					<TableHead>
						<Text>{t('State code')}</Text>
					</TableHead>
					<TableHead>
						<Text>{t('Postcode')}</Text>
					</TableHead>
					<TableHead>
						<Text>{t('City')}</Text>
					</TableHead>
					<TableHead>
						<Text>{t('Rate %')}</Text>
					</TableHead>
					<TableHead>
						<Text>{t('Tax name')}</Text>
					</TableHead>
					<TableHead className="w-12">
						<Text>{t('Priority')}</Text>
					</TableHead>
					<TableHead className="w-12">
						<Text>{t('Compound')}</Text>
					</TableHead>
					<TableHead className="w-12">
						<Text>{t('Shipping')}</Text>
					</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{rates.map((rate, index) => (
					<TableRow key={rate.id} index={index}>
						<TableCell>
							<Text>{rate.country}</Text>
						</TableCell>
						<TableCell>
							<Text>
								{rate.state ? (
									<Text>{rate.state}</Text>
								) : (
									<Text className="text-4xl leading-none">*</Text>
								)}
							</Text>
						</TableCell>
						<TableCell>
							{Array.isArray(rate.postcodes) && rate.postcodes.length > 0 ? (
								<Text>{rate.postcodes.join(', ')}</Text>
							) : (
								<Text className="text-4xl leading-none">*</Text>
							)}
						</TableCell>
						<TableCell>
							{Array.isArray(rate.cities) && rate.cities.length > 0 ? (
								<Text>{rate.cities.join(', ')}</Text>
							) : (
								<Text className="text-4xl leading-none">*</Text>
							)}
						</TableCell>
						<TableCell>
							<Text>{rate.rate}</Text>
						</TableCell>
						<TableCell>
							<Text>{rate.name}</Text>
						</TableCell>
						<TableCell className="w-12">{rate.priority}</TableCell>
						<TableCell className="w-12">
							<Icon name={rate.compound ? 'check' : 'xmark'} />
						</TableCell>
						<TableCell className="w-12">
							<Icon name={rate.shipping ? 'check' : 'xmark'} />
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
};
