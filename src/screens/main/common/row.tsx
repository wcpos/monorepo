import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import Table from '@wcpos/components/src/table';
import Text from '@wcpos/components/src/text';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';

export type ColumnProps = import('@wcpos/components/src/table/types').ColumnProps;
type GetCellPropsFunction = import('@wcpos/components/src/table/row').GetCellPropsFunction;
type CellRenderProps = {
	cellData: any;
	column: ColumnProps;
	getCellProps: GetCellPropsFunction;
};
export type ItemProp =
	| import('@wcpos/database').ProductDocument
	| import('@wcpos/database').OrderDocument
	| import('@wcpos/database').CustomerDocument;
export type CellsProp = Record<
	string,
	React.FunctionComponent<{ item: any; column: any; setQuery?: any }>
>;

interface CommonRowProps {
	item: ItemProp;
	columns: ColumnProps[];
	cells: CellsProp;
	setQuery: any;
}

// @ts-ignore
const DefaultCell = ({ item, column }) => {
	return <Text>{String(item[column.key])}</Text>;
};

/**
 *
 */
const CommonRow = ({ item, columns, cells, setQuery }: CommonRowProps) => {
	const forceRender = useObservableState(item.$);
	useWhyDidYouUpdate('Common Table Row', { forceRender, item, columns, cells });

	return (
		<Table.Body.Row rowData={item} columns={columns}>
			{({ column, getCellProps }: CellRenderProps): React.ReactElement => {
				const Cell = cells[column.key] ? cells[column.key] : DefaultCell;
				return (
					<Table.Body.Row.Cell {...getCellProps()}>
						<Cell item={item} column={column} setQuery={setQuery} />
					</Table.Body.Row.Cell>
				);
			}}
		</Table.Body.Row>
	);
};

export default React.memo(CommonRow);
