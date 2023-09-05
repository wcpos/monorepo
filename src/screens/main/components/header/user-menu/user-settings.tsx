import * as React from 'react';

import { useObservable, useObservableState } from 'observable-hooks';
import { switchMap } from 'rxjs/operators';

import Select from '@wcpos/components/src/select';
import Table from '@wcpos/components/src/table';
import Text from '@wcpos/components/src/text';
import log from '@wcpos/utils/src/logger';

import { useCollection } from '../../../../../hooks/use-collection';

interface UserSettingsProps {
	onClose: () => void;
}

const UserSettings = ({ onClose }: UserSettingsProps) => {
	const [country, setCountry] = React.useState('GB');
	const { collection } = useCollection('taxes');

	const taxRates$ = useObservable(
		(inputs$) =>
			inputs$.pipe(
				switchMap((q) => {
					const RxQuery = collection.find().where('country').eq(country);
					// @ts-ignore
					return RxQuery.$;
				})
			),
		[country]
	);

	const taxRates = useObservableState(taxRates$, []);
	log.silly(taxRates);

	return (
		<>
			<Text>Store location: </Text>
			<Select
				label="Country"
				placeholder="GB"
				options={[
					{ label: 'GB', value: 'GB' },
					{ label: 'US', value: 'US' },
				]}
			/>
			<Table
				columns={[
					{ key: 'country', label: 'Country' },
					{ key: 'name', label: 'Name' },
					{ key: 'rate', label: 'Rate' },
				]}
				// @ts-ignore
				data={taxRates}
			/>
		</>
	);
};

export default UserSettings;
