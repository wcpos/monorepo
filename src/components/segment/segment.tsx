import React from 'react';
import Text from '../text';
import { SegmentView } from './styles';

export type Props = {
	children?: React.ReactNode;
	content?: React.ReactNode;
	kind?: 'body' | 'footer' | 'header';
	type?: 'raised' | 'stacked' | 'piled' | 'vertical' | '';
	disabled?: boolean;
	loading?: boolean;
	raised?: boolean;
};

const Segment = ({ children, content, ...rest }: Props) => {
	let segment = content || children || '';
	if (typeof segment === 'string' || typeof segment === 'number') {
		segment = <Text>{segment}</Text>;
	}

	return <SegmentView {...rest}>{segment}</SegmentView>;
};

export default Segment;
