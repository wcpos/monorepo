import * as React from 'react';
import { useObservable, useObservableState, useObservableSuspense } from 'observable-hooks';
import { tap, switchMap } from 'rxjs/operators';
import { View } from 'react-native';
import Dialog from '@wcpos/common/src/components/dialog';
import Text from '@wcpos/common/src/components/text';
import Select from '@wcpos/common/src/components/select';
import Table from '@wcpos/common/src/components/table';
import useAppState from '@wcpos/common/src/hooks/use-app-state';

interface UserSettingsProps {
	onClose: () => void;
}

const UserSettings = ({ onClose }: UserSettingsProps) => {
	const { storeDB } = useAppState();
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
		<Dialog
			sectioned
			title="Settings"
			open
			onClose={onClose}
			primaryAction={{ label: 'Save', action: onClose }}
		>
			<View style={{ zIndex: 999999 }}>
				<Text>Store location: </Text>
				<Select
					label="Country"
					placeholder="GB"
					choices={[
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
			</View>
		</Dialog>
	);
};

export default UserSettings;
