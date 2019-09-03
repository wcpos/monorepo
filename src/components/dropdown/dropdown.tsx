import React, { useState } from 'react';
import Text from '../text';
import Portal from '../portal';

export type Props = {};

const Content = <Text style={{ color: 'white' }}>Content</Text>;

const Dropdown = ({  }: Props) => {
	const [key, setKey] = useState();

	return (
		<Text
			onPress={() => {
				const key = Portal.add(Content);
				setKey(key);
			}}
		>
			Dropdown
		</Text>
	);
};

export default Dropdown;
