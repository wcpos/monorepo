import * as React from 'react';
import Text from '../../../../../components/text';

type Tag = {
	id: string;
	name: string;
};

interface Props {
	tags: Tag[];
}

const Tags = ({ tags }: Props) => {
	const handleClick = (tag: Tag) => {
		console.log('filter by tag ', tag);
	};

	return tags.map((tag) => (
		<Text key={tag.id} onPress={() => handleClick(tag)}>
			{tag.name}
		</Text>
	));
};

export default Tags;
