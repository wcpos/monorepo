import * as React from 'react';
import Tag from '@wcpos/common/src/components/tag';

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
				<Tag key={category.id} onPress={() => handleClick(category)}>
					{category.name}
				</Tag>
			))}
		</>
	);
};

export default Categories;
