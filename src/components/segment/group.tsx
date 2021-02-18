import * as React from 'react';
import * as Styled from './styles';

type Segment = typeof import('./segment').Segment;
// type ISegmentProps = import('./segment').ISegmentProps;
type ISegmentProps = import('./segment').ISegmentProps;

export interface ISegmentGroupProps {
	children: React.ReactElement<Segment>[];
	style?: import('react-native').ViewStyle;
	raised?: boolean;
	direction?: 'vertical' | 'horizontal';
}

export const SegmentGroup = ({
	children,
	direction = 'vertical',
	style,
	raised = true,
}: ISegmentGroupProps) => {
	const count = React.Children.count(children);

	return (
		// @ts-ignore
		<Styled.Group style={style} raised={raised} direction={direction}>
			{React.Children.count(children) > 1 &&
				React.Children.map(children, (child, index) => {
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
						return React.cloneElement(child as React.ReactElement<ISegmentProps>, props);
					}
					return null;
				})}
		</Styled.Group>
	);
};
