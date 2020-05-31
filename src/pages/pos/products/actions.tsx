import React from 'react';
import Input from '../../../components/textinput';
import Checkbox from '../../../components/checkbox';

interface Props {}

/**
 *
 */
const Actions: React.FC<Props> = ({ columns, display }) => {
	const onFilter = () => {
		console.log('change query');
	};

	return (
		<React.Fragment>
			<Input placeholder="Search products" onChangeText={onFilter} />
			{columns.map((column: any) => (
				<Checkbox
					key={column.key}
					name={column.key}
					label={column.label}
					checked={!column.hide}
					onChange={(checked) => {
						column.updateWithJson({ hide: !checked });
					}}
				/>
			))}
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
			))}
		</React.Fragment>
	);
};

export default Actions;
