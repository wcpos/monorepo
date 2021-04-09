import * as React from 'react';
import { useTranslation } from 'react-i18next';
import Checkbox from '../../../components/checkbox';
import Button from '../../../components/button';
import Text from '../../../components/text';

interface ICartActionsProps {
	ui: any;
	columns: any[];
}

/**
 *
 */
const Actions = ({ columns, ui }: ICartActionsProps) => {
	const [t] = useTranslation();

	return (
		<>
			<Text>Columns</Text>
			{columns.map((column: any, index) => (
				<Checkbox
					key={column.key}
					name={column.key}
					label={t(`cart.column.label.${column.key}`)}
					checked={!column.hide}
					onChange={(checked) => {
						// ui.updateColumn(column.key, { hide: !checked });
						// column.updateWithJson({ hide: !checked });
						columns[index] = { ...column, hide: !checked };
						ui.atomicSet('columns', columns);
					}}
				/>
			))}
			{/* <Text>Display</Text>
			{display.map((d: any, index) => (
				<Checkbox
					key={d.key}
					name={d.key}
					label={t(`pos_products.display.label.${d.key}`)}
					checked={!d.hide}
					onChange={(checked) => {
						// ui.updateDisplay(d.key, { hide: !checked });
						// d.updateWithJson({ hide: !checked });
						display[index] = { ...d, hide: !checked };
						ui.atomicSet('display', display);
					}}
				/>
			))} */}
			<Button
				title="Restore Default Settings"
				onPress={() => {
					ui.reset();
				}}
			/>
		</>
	);
};

export default Actions;
