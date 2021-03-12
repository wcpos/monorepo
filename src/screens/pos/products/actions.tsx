import * as React from 'react';
import { useTranslation } from 'react-i18next';
import Checkbox from '../../../components/checkbox';
import Button from '../../../components/button';
import Text from '../../../components/text';

type ColumnProps = import('../../../components/table/types').ColumnProps;

interface IPOSProductActionsProps {
	columns: ColumnProps[];
	display: any[];
	ui: any;
}

/**
 *
 */
const Actions = ({ columns, display, ui }: IPOSProductActionsProps) => {
	const [t] = useTranslation();

	const onFilter = () => {
		console.log('change query');
	};

	return (
		<>
			<Text>Columns</Text>
			{columns.map((column: any, index) => (
				<Checkbox
					key={column.key}
					name={column.key}
					label={t(`pos_products.column.label.${column.key}`)}
					checked={!column.hide}
					onChange={(checked) => {
						// ui.updateColumn(column.key, { hide: !checked });
						// column.updateWithJson({ hide: !checked });
						columns[index] = { ...column, hide: !checked };
						ui.atomicSet('columns', columns);
					}}
				/>
			))}
			<Text>Display</Text>
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
			))}
			<Button
				title="Restore Default Settings"
				onPress={() => {
					ui.parent.upsertLocal('pos_products', {
						sortBy: 'name',
						sortDirection: 'asc',
						width: '60%',
						columns: [
							{ key: 'image', disableSort: true, order: 1 },
							{ key: 'name', order: 2 },
							{ key: 'sku', hide: true, order: 3 },
							{ key: 'price', order: 4 },
							{ key: 'actions', disableSort: true, order: 5 },
						],
						display: [
							{ key: 'sku', hide: true, order: 1 },
							{ key: 'categories', order: 2 },
							{ key: 'tags', hide: true, order: 3 },
						],
					});
				}}
			/>
			<Button
				title="Change width"
				onPress={() => {
					ui.atomicSet('width', '40%');
				}}
			/>
		</>
	);
};

export default Actions;
