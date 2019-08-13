import React, { Fragment } from 'react';
import useObservable from '../../../hooks/use-observable';
import Text from '../../../components/text';
import Checkbox from '../../../components/checkbox';

interface Props {
	ui: any;
}

const Settings = ({ ui }: Props) => {
	const columns = useObservable(ui.columns.observeWithColumns(['hide']), []);

	return (
		<Fragment>
			<Text>Settings</Text>
			<Text>Columns</Text>
			{columns.map((column: any) => (
				<Checkbox
					key={column.key}
					label={column.label}
					checked={!column.hide}
					onChange={() => column.update({ hide: !column.hide })}
				/>
			))}
			<Text>Display</Text>
			{ui.display.map((column: any) => (
				<Checkbox
					key={column.key}
					label={column.label}
					checked={!column.hide}
					onChange={() => {
						debugger;
					}}
				/>
			))}
		</Fragment>
	);
};

export default Settings;
