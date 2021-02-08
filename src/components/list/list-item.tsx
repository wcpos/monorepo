import * as React from 'react';
import { TouchableOpacity } from 'react-native';
import { ListItemView, ListItemTextView } from './styles';
import Icon from '../icon';
import Button from '../button';
import Text from '../text';

type Props = {
	label: string;
	info?: string | React.Component;
	icon?: string | React.Component;
	action?: string | React.Component;
	onPress?: () => void;
	onAction?: () => void;
};

const ListItem = ({ label, info, onPress, icon, action, onAction }: Props) => {
	const renderIcon = () => (typeof icon === 'string' ? <Icon name={icon} /> : icon);
	const renderInfo = () =>
		typeof info === 'string' ? (
			<Text size="small" type="secondary">
				{info}
			</Text>
		) : (
			info
		);
	const renderAction = () =>
		typeof action === 'string' ? <Button title={action} onPress={onAction} /> : action;

	const handlePress = () => {
		onPress && onPress({ label });
	};

	return (
		<TouchableOpacity onPress={handlePress}>
			<ListItemView>
				{icon && renderIcon()}
				<ListItemTextView>
					<Text>{label}</Text>
					{info && renderInfo()}
				</ListItemTextView>
				{action && renderAction()}
			</ListItemView>
		</TouchableOpacity>
	);
};

export default ListItem;
