import React, { useState } from 'react';
import Icon from '../icon';
import Popover from '../popover';
import List from '../list';
import Touchable from '../touchable';
import { TriggerWrapper, TriggerText } from './styles';

export type Props = {
	placeholder?: string;
	options: any[];
	onSelect?: () => void;
};

const Select = ({ placeholder, options, onSelect }: Props) => {
	const [selection, setSelection] = useState(placeholder);

	const handleItemPress = ({ label }) => {
		onSelect && onSelect(label);
		setSelection(label);
	};

	return (
		<Popover content={<List items={options} onItemPress={handleItemPress} />}>
			<Touchable>
				<TriggerWrapper>
					<TriggerText>{selection}</TriggerText>
					<Icon name="angle-down" />
				</TriggerWrapper>
			</Touchable>
		</Popover>
	);
};

export default Select;
