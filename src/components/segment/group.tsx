import React from 'react';
import { SegmentGroupView } from './styles';

type Segment = typeof import('./segment').default;

export type Props = {
	children: React.ReactElement<Segment>[] | React.ReactElement<Segment>;
	style?: import('react-native').ViewStyle;
	raised?: boolean;
};

const SegmentGroup = ({ children, style, raised = true }: Props) => {
	const count = React.Children.count(children);
	return (
		<SegmentGroupView style={style} raised={raised}>
			{React.Children.map(children, (child, index) => {
				let props = { group: 'middle', raised: false };
				if (index === 0) {
					props.group = 'first';
				}
				if (index === count - 1) {
					props.group = 'last';
				}
				return React.cloneElement(child, props);
			})}
		</SegmentGroupView>
	);
};

export default SegmentGroup;
