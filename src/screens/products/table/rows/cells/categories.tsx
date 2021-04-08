import * as React from 'react';
import Text from '../../../../../components/text';

type Category = {
	id: string;
	name: string;
};

interface Props {
	categories: Category[];
}

const Categories = ({ categories }: Props) => {
	const handleClick = (category: Category) => {
		console.log('filter by cat ', category);
	};

	return (
		<>
			{categories.map((category) => (
				<Text key={category.id} onPress={() => handleClick(category)}>
					{category.name}
				</Text>
			))}
		</>
	);
};

export default Categories;
