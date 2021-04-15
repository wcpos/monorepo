import * as React from 'react';
import { useTranslation } from 'react-i18next';
import Input from '../../components/textinput';
import Checkbox from '../../components/checkbox';
import Button from '../../components/button';
import Text from '../../components/text';

interface Props {
	columns: any;
	resetUI?: () => void;
	ui: any;
}

/**
 *
 */
const Actions: React.FC<Props> = ({ ui, columns }) => {
	const { t } = useTranslation();

	const onFilter = () => {
		console.log('change query');
	};

	return (
		<>
			<Input placeholder="Search orders" onChange={onFilter} />
			<Text>Columns</Text>
			{columns.map((column: any, index: number) => (
				<Checkbox
					key={column.key}
					name={column.key}
					label={t(`orders.column.label.${column.key}`)}
					checked={!column.hide}
					onChange={(checked) => {
						columns[index] = { ...column, hide: !checked };
						ui.atomicSet('columns', columns);
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
