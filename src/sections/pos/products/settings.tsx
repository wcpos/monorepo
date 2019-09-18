import React, { Fragment } from 'react';
import Text from '../../../components/text';
import Checkbox from '../../../components/checkbox';

interface Props {
	ui: any;
	updateUI: any;
}

const Settings = ({ ui, updateUI }: Props) => {
	return (
		<Fragment>
			<Text>Settings</Text>
			<Text>Columns</Text>
			{ui.columns.map((column: any) => (
				<Checkbox
					key={column.key}
					label={column.label}
					checked={!column.hide}
					onChange={updateUI}
				/>
			))}
			<Text>Display</Text>
			{ui.display.map((column: any) => (
				<Checkbox
					key={column.key}
					label={column.label}
					checked={!column.hide}
					onChange={updateUI}
				/>
			))}
		</Fragment>
	);
};

export default Settings;
