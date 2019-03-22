import React from 'react';
import { TouchableOpacity } from 'react-native';
import { ListItemView, ListItemTextView, ListItemText } from './styles';
import Icon from '../icon';
import Button from '../button';

type Props = {
	label: string;
	info?: string;
	icon?: string | React.Component;
	action?: string;
	onPress?: () => void;
	onAction?: () => void;
};

const ListItem = ({ label, info, onPress, icon, action, onAction }: Props) => {
	const renderIcon = () => {
		if (typeof icon === 'string') {
			return <Icon name={icon} />;
		}
		return icon;
	};

	return (
		<TouchableOpacity onPress={onPress}>
			<ListItemView>
				{icon && renderIcon()}
				<ListItemTextView>
					<ListItemText>{label}</ListItemText>
					{info && <ListItemText>{info}</ListItemText>}
				</ListItemTextView>
				{action && <Button title={action} onPress={onAction} />}
			</ListItemView>
		</TouchableOpacity>
	);
};

export default ListItem;
