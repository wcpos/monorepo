import React, { Fragment } from 'react';
import Text from '../../../../components/text';
import Checkbox from '../../../../components/checkbox';

interface Props {
	ui: any;
	updateUI: any;
}

const Settings = ({ ui, updateUI }: Props) => {
	const handleColumnUpdate = (checked, event) => {
		updateUI({
			type: 'UI_UPDATE',
			payload: {
				pos_products: {
					...ui,
					columns: ui.columns.map(column => {
						if (column.key === event.target.name) {
							return { ...column, hide: !event.target.checked };
						}
						return column;
					}),
				},
			},
		});
	};

	const handleDisplayUpdate = (checked, event) => {
		updateUI({
			type: 'UI_UPDATE',
			payload: {
				pos_products: {
					...ui,
					display: ui.display.map(display => {
						if (display.key === event.target.name) {
							return { ...display, hide: !event.target.checked };
						}
						return display;
					}),
				},
			},
		});
	};

	return (
		<Fragment>
			<Text>Settings</Text>
			<Text>Columns</Text>
			{ui.columns.map((column: any) => (
				<Checkbox
					key={column.key}
					name={column.key}
					label={column.label}
					checked={!column.hide}
					onChange={handleColumnUpdate}
				/>
			))}
			<Text>Display</Text>
			{ui.display.map((display: any) => (
				<Checkbox
					key={display.key}
					name={display.key}
					label={display.label}
					checked={!display.hide}
					onChange={handleDisplayUpdate}
				/>
			))}
		</Fragment>
	);
};

export default Settings;
