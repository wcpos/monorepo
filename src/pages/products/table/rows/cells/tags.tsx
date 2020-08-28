import React from 'react';
import Text from '../../../../../components/text';

interface Props {
	tags: [];
}

const Tags = ({ tags }: Props) => {
	const handleClick = (tag) => {
		console.log('filter by tag ', tag);
	};

	return tags.map((tag) => (
		<Text key={tag.id} onPress={() => handleClick(tag)}>
			{tag.name}
		</Text>
	));
};

export default Tags;
