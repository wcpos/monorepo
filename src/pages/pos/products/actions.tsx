import React from 'react';
import { useTranslation } from 'react-i18next';
import Input from '../../../components/textinput';
import Checkbox from '../../../components/checkbox';
import Button from '../../../components/button';
import Text from '../../../components/text';

interface Props {
	columns: any[];
	display: any[];
	resetUI: () => void;
}

/**
 *
 */
const Actions: React.FC<Props> = ({ columns, display, resetUI }) => {
	const { t } = useTranslation();

	const onFilter = () => {
		console.log('change query');
	};

	return (
		<>
			<Input placeholder="Search products" onChangeText={onFilter} />
			<Text>Columns</Text>
			{columns.map((column: any) => (
				<Checkbox
					key={column.key}
					name={column.key}
					label={t(`pos_products.column.label.${column.key}`)}
					checked={!column.hide}
					onChange={(checked) => {
						column.updateWithJson({ hide: !checked });
					}}
				/>
			))}
			<Text>Display</Text>
			{display.map((d: any) => (
				<Checkbox
					key={d.key}
					name={d.key}
					label={t(`pos_products.display.label.${d.key}`)}
					checked={!d.hide}
					onChange={(checked) => {
						d.updateWithJson({ hide: !checked });
					}}
				/>
			))}
			<Button title="Restore Default Settings" onPress={resetUI} />
		</>
	);
};

export default Actions;
