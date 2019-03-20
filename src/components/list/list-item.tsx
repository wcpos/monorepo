import React from 'react';
import { TouchableOpacity } from 'react-native';
import { ListItemText } from './styles';
import Icon from '../icon';

type Props = {
	text: string;
	onPress: () => void;
	icon?: string;
};

const ListItem = ({ text, onPress, icon }: Props) => {
	return (
		<TouchableOpacity onPress={onPress}>
			{icon && <Icon name={icon} />}
			<ListItemText>{text}</ListItemText>
		</TouchableOpacity>
	);
};

export default ListItem;
