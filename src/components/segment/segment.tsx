import * as React from 'react';
import Text from '../text';
import * as Styled from './styles';
import { SegmentGroup } from './group';

export interface ISegmentProps {
	children?: React.ReactNode;
	content?: React.ReactNode;
	type?: 'body' | 'footer' | 'header';
	disabled?: boolean;
	loading?: boolean;
	raised?: boolean;
	group?: 'first' | 'middle' | 'last';
	style?: import('react-native').ViewStyle;
	grow?: boolean;
}

export const Segment = ({
	children,
	content,
	group,
	grow,
	type,
	raised = true,
	style,
}: ISegmentProps) => {
	let segment = content || children || '';
	if (typeof segment === 'string' || typeof segment === 'number') {
		segment = <Text>{segment}</Text>;
	}

	return (
		<Styled.Segment group={group} type={type} raised={raised} grow={grow}>
			{segment}
		</Styled.Segment>
	);
};

Segment.Group = SegmentGroup;
