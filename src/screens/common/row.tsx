import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import Table from '@wcpos/common/src/components/table';
import Text from '@wcpos/common/src/components/text';
import useWhyDidYouUpdate from '@wcpos/common/src/hooks/use-why-did-you-update';

export type ColumnProps = import('@wcpos/common/src/components/table/types').ColumnProps;
type GetCellPropsFunction = import('@wcpos/common/src/components/table/row').GetCellPropsFunction;
type CellRenderProps = {
	cellData: any;
	column: ColumnProps;
	getCellProps: GetCellPropsFunction;
};
export type ItemProp =
	| import('@wcpos/common/src/database').ProductDocument
	| import('@wcpos/common/src/database').OrderDocument
	| import('@wcpos/common/src/database').CustomerDocument;
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

const DefaultCell = () => <Text>No cell component</Text>;

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
