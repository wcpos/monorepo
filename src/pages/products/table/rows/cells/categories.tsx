import React from 'react';
import Text from '../../../../../components/text';

interface Props {
	categories: [];
}

const Categories = ({ categories }: Props) => {
	const handleClick = (category) => {
		console.log('filter by cat ', category);
	};

	return categories.map((category) => (
		<Text key={category.id} onPress={() => handleClick(category)}>
			{category.name}
		</Text>
	));
};

export default Categories;
