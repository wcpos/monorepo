import React from 'react';
import { TouchableOpacity } from 'react-native';
import { ListItemText } from './styles';

type Props = {
	text: string;
	onPress: () => void;
};

const ListItem = ({ text, onPress }: Props) => {
	return (
		<TouchableOpacity onPress={onPress}>
			<ListItemText>{text}</ListItemText>
		</TouchableOpacity>
	);
};

export default ListItem;
