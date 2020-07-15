import React from 'react';
import { useTranslation } from 'react-i18next';
import Checkbox from '../../../components/checkbox';
import Button from '../../../components/button';
import Text from '../../../components/text';

interface Props {
	ui: any;
}

/**
 *
 */
const Actions: React.FC<Props> = ({ columns, display }) => {
	const [t] = useTranslation();

	const onFilter = () => {
		console.log('change query');
	};

	return (
		<>
			<Text>Columns</Text>
			{columns.map((column: any) => (
				<Checkbox
					key={column.key}
					name={column.key}
					label={t(`pos_products.column.label.${column.key}`)}
					checked={!column.hide}
					onChange={(checked) => {
						// ui.updateColumn(column.key, { hide: !checked });
						// column.updateWithJson({ hide: !checked });
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
						// ui.updateDisplay(d.key, { hide: !checked });
						// d.updateWithJson({ hide: !checked });
					}}
				/>
			))}
			<Button title="Restore Default Settings" onPress={() => {}} />
			<Button title="Change width" onPress={() => {}} />
		</>
	);
};

export default Actions;
