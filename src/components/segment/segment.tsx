import React from 'react';
import Text from '../text';
import { SegmentView } from './styles';

export type Props = {
	children?: React.ReactNode;
	content?: React.ReactNode;
	type?: 'body' | 'footer' | 'header';
	disabled?: boolean;
	loading?: boolean;
	raised?: boolean;
	group?: 'first' | 'middle' | 'last';
};

const Segment = ({ children, content, group, type, raised = true }: Props) => {
	let segment = content || children || '';
	if (typeof segment === 'string' || typeof segment === 'number') {
		segment = <Text>{segment}</Text>;
	}

	return (
		<SegmentView group={group} type={type} raised={raised}>
			{segment}
		</SegmentView>
	);
};

export default Segment;
