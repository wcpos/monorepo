import * as React from 'react';

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
						<Text>{t('tax_rates.country_code')}</Text>
					</TableHead>
					<TableHead>
						<Text>{t('tax_rates.state_code')}</Text>
					</TableHead>
					<TableHead>
						<Text>{t('common.postcode')}</Text>
					</TableHead>
					<TableHead>
						<Text>{t('common.city')}</Text>
					</TableHead>
					<TableHead>
						<Text>{t('tax_rates.rate')}</Text>
					</TableHead>
					<TableHead>
						<Text>{t('tax_rates.tax_name')}</Text>
					</TableHead>
					<TableHead className="w-12">
						<Text>{t('tax_rates.priority')}</Text>
					</TableHead>
					<TableHead className="w-12">
						<Text>{t('tax_rates.compound')}</Text>
					</TableHead>
					<TableHead className="w-12">
						<Text>{t('common.shipping')}</Text>
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
						<TableCell className="w-12">
							<Text>{rate.priority}</Text>
						</TableCell>
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
