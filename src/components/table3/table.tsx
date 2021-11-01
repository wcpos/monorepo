import * as React from 'react';
import { View, ViewStyle, NativeSyntheticEvent, NativeTouchEvent } from 'react-native';
import { useVirtual } from 'react-virtual';
import get from 'lodash/get';
import Text from '../text';
import Row, { TableRowProps } from './row';
import * as Styled from './styles';

export type SortDirection = 'asc' | 'desc';

export interface SortProps {
	defaultSortDirection?: SortDirection;
	event: NativeSyntheticEvent<NativeTouchEvent>;
	sortBy: string | number;
	sortDirection?: SortDirection;
}

export type Sort = (props: SortProps) => void;

export interface ColumnProps {
	key: string;
	label: string;
	hide?: boolean;
	disableSort?: boolean;
	hideLabel?: boolean;
	flexGrow?: 0 | 1;
	flexShrink?: 0 | 1;
	flexBasis?: any;
	width?: string;
	defaultSortDirection?: SortDirection;
}

export interface TableProps {
	children?: (props: TableRowProps) => React.ReactNode;
	data: any[];
	columns: ColumnProps[];
	style?: ViewStyle;
}

const Table = ({ data, columns, children, style }: TableProps) => {
	const parentRef = React.useRef() as React.MutableRefObject<View>;

	const rowVirtualizer = useVirtual({
		size: data.length,
		parentRef,
	});

	const keyExtractor = React.useCallback(
		(item: any, index: number) => get(item, 'localID') || index,
		[]
	);

	const renderRow = React.useCallback(
		(virtualRow) => {
			const item = data[virtualRow.index];

			if (typeof children === 'function') {
				return children({
					item,
					columns,
					translateY: virtualRow.start,
					measureRef: virtualRow.measureRef,
				});
			}

			return (
				<Row
					key={keyExtractor(item, virtualRow.index)}
					item={item}
					columns={columns}
					measureRef={virtualRow.measureRef}
					translateY={virtualRow.start}
				/>
			);
		},
		[children, columns, data, keyExtractor]
	);

	return (
		<Styled.Table style={style}>
			<Styled.HeaderRow>
				{columns.map((column, index) => {
					const style = {};
					const { key, flexGrow = 1, flexShrink = 1, flexBasis = 'auto', width = '100%' } = column;
					return (
						<Styled.HeaderCell
							key={key}
							style={[{ flexGrow, flexShrink, flexBasis, width }, style]}
						>
							<Text>{column.label}</Text>
						</Styled.HeaderCell>
					);
				})}
			</Styled.HeaderRow>
			<Styled.Body ref={parentRef}>
				<Styled.ListContainer style={{ height: rowVirtualizer.totalSize }}>
					{rowVirtualizer.virtualItems.map(renderRow)}
				</Styled.ListContainer>
			</Styled.Body>
		</Styled.Table>
	);
};

Table.Row = Row;
export default Table;
