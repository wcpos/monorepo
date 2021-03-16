// @ts-nocheck
// @TODO - fix typescript
import * as React from 'react';
import * as Styled from './styles';

type Segment = typeof import('./segment').Segment;
// type ISegmentProps = import('./segment').ISegmentProps;
type ISegmentProps = import('./segment').ISegmentProps;

export interface ISegmentGroupProps {
	children: React.ReactElement<Segment>[] | React.ReactElement<Segment>;
	style?: import('react-native').ViewStyle;
	raised?: boolean;
	flexDirection?: 'row' | 'column';
}

export const SegmentGroup = ({
	children,
	flexDirection = 'column',
	style,
	raised = true,
}: ISegmentGroupProps) => {
	const count = React.Children.count(children);

	if (count === 1) {
		return children;
	}

	return (
		<Styled.Group style={style} raised={raised} flexDirection={flexDirection}>
			{React.Children.map(children, (child, index) => {
				if (React.isValidElement(child)) {
					const props: { group?: 'first' | 'middle' | 'last'; raised?: boolean } = {
						group: 'middle',
						raised: false,
					};
					if (index === 0) {
						props.group = 'first';
					}
					if (index === count - 1) {
						props.group = 'last';
					}
					return React.cloneElement(child as React.ReactElement<Segment>, props);
				}
				return [];
			})}
		</Styled.Group>
	);
};
