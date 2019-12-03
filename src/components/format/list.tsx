import React, { Fragment } from 'react';
import Text from '../text';

interface Props {
	array?: [];
}

const List = ({ array }: Props) => {
	return (
		<Fragment>
			{array?.map((item, index) => {
				if (typeof item === 'string') {
					return <Text>{item}, </Text>;
				} else {
					return item;
				}
			})}
		</Fragment>
	);
};

export default List;
