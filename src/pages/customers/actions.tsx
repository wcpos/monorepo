import React from 'react';
import { useTranslation } from 'react-i18next';
import Input from '../../components/textinput';
import Checkbox from '../../components/checkbox';
import Button from '../../components/button';
import Text from '../../components/text';

interface Props {
	columns: any;
	resetUI: () => void;
}

/**
 *
 */
const Actions: React.FC<Props> = ({ ui }) => {
	const { t } = useTranslation();

	const onFilter = () => {
		console.log('change query');
	};

	return (
		<>
			<Input placeholder="Search orders" onChangeText={onFilter} />
			<Text>Columns</Text>
			{ui.columns.map((column: any) => (
				<Checkbox
					key={column.key}
					name={column.key}
					label={t(`customers.column.label.${column.key}`)}
					checked={!column.hide}
					onChange={(checked) => {
						ui.updateColumn(column.key, { hide: !checked });
					}}
				/>
			))}
			{/* <Text>Display</Text>
			{display.map((d: any) => (
				<Checkbox
					key={d.key}
					name={d.key}
					label={d.label}
					checked={!d.hide}
					onChange={(checked) => {
						d.updateWithJson({ hide: !checked });
					}}
				/>
			))} */}
			<Button title="Restore Default Settings" onPress={ui.reset} />
		</>
	);
};

export default Actions;
