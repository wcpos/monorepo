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
const Actions: React.FC<Props> = ({ columns, ui }) => {
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
					ui.parent.upsertLocal('pos_cart', {
						width: '40%',
						sortBy: 'id',
						sortDirection: 'asc',
						columns: [
							{ key: 'quantity', order: 0 },
							{ key: 'name', order: 1 },
							{ key: 'sku', order: 2 },
							{ key: 'price', order: 3 },
							{ key: 'subtotal', order: 4 },
							{ key: 'subtotal_tax', order: 5 },
							{ key: 'total_tax', order: 6 },
							{ key: 'total', order: 7 },
						],
					});
				}}
			/>
		</>
	);
};

export default Actions;
