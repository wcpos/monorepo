import React from 'react';
import Text from '../text';

export type Props = {
	children?: React.ReactNode;
	buttons: any[];
	selectedIndex?: number;
	onPress?: () => void;
};

const Group = ({ children, ...rest }: Props) => {
	return <Text>group</Text>;
};

export default Group;
