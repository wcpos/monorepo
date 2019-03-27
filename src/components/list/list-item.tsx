import React from 'react';
import { TouchableOpacity } from 'react-native';
import { ListItemView, ListItemTextView, ListItemText } from './styles';
import Icon from '../icon';
import Button from '../button';

type Props = {
	label: string;
	info?: string | React.Component;
	icon?: string | React.Component;
	action?: string;
	onPress?: () => void;
	onAction?: () => void;
};

const ListItem = ({ label, info, onPress, icon, action, onAction }: Props) => {
	const renderIcon = () => (typeof icon === 'string' ? <Icon name={icon} /> : icon);
	const renderInfo = () => (typeof info === 'string' ? <ListItemText>{info}</ListItemText> : info);

	return (
		<TouchableOpacity onPress={onPress}>
			<ListItemView>
				{icon && renderIcon()}
				<ListItemTextView>
					<ListItemText>{label}</ListItemText>
					{info && renderInfo()}
				</ListItemTextView>
				{action && <Button title={action} onPress={onAction} />}
			</ListItemView>
		</TouchableOpacity>
	);
};

export default ListItem;
