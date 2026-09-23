import { Text } from '../text';
import {
	PressableTableRow,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from './index';

const items = [
	['Coffee', '2', '6.00'],
	['Tea', '1', '2.50'],
	['Cake', '1', '4.00'],
	['Water', '2', '3.00'],
];
export const stories = ['rows', 'selected', 'pressable'].map((id) => ({
	id,
	render: () => {
		const Row = id === 'pressable' ? PressableTableRow : TableRow;
		return (
			<Table>
				<TableHeader>
					<TableRow>
						{['Item', 'Qty', 'Total'].map((label) => (
							<TableHead key={label}>
								<Text>{label}</Text>
							</TableHead>
						))}
					</TableRow>
				</TableHeader>
				<TableBody>
					{items.map((cells, index) => (
						<Row
							key={cells[0]}
							index={index}
							{...{ dataSet: { state: id === 'selected' && index === 1 ? 'selected' : undefined } }}
						>
							{cells.map((cell, column) => (
								<TableCell key={column}>
									<Text>{cell}</Text>
								</TableCell>
							))}
						</Row>
					))}
				</TableBody>
			</Table>
		);
	},
}));
