import React from 'react';
import Text from '../text';
import * as Styled from './styles';

export type Props = {
	children?: React.ReactNode;
	content?: React.ReactNode;
	type?: 'body' | 'footer' | 'header';
	disabled?: boolean;
	loading?: boolean;
	raised?: boolean;
	group?: 'first' | 'middle' | 'last';
	style?: import('react-native').ViewStyle;
	grow?: boolean;
};

const Segment: React.FC<Props> = ({
	children,
	content,
	group,
	grow,
	type,
	raised = true,
	style,
}) => {
	let segment = content || children || '';
	if (typeof segment === 'string' || typeof segment === 'number') {
		segment = <Text>{segment}</Text>;
	}

	return (
		<Styled.Segment style={style} group={group} type={type} raised={raised} grow={grow}>
			{segment}
		</Styled.Segment>
	);
};

export default Segment;
