import * as React from 'react';
import { useObservable, useObservableState, useObservableSuspense } from 'observable-hooks';
import { tap, switchMap } from 'rxjs/operators';
import { View } from 'react-native';
import Text from '@wcpos/components/src/text';
import Select from '@wcpos/components/src/select';
import Table from '@wcpos/components/src/table';
import useStore from '@wcpos/hooks/src/use-store';

interface UserSettingsProps {
	onClose: () => void;
}

const UserSettings = ({ onClose }: UserSettingsProps) => {
	const { storeDB } = useStore();
	const [country, setCountry] = React.useState('GB');

	const taxRates$ = useObservable(
		(inputs$) =>
			inputs$.pipe(
				switchMap((q) => {
					const RxQuery = storeDB?.collections.taxes.find().where('country').eq(country);
					// @ts-ignore
					return RxQuery.$;
				})
			),
		[country]
	);

	const taxRates = useObservableState(taxRates$, []);
	console.log(taxRates);

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
