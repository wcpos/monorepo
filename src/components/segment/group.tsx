// @TODO - fix typescript
import * as React from 'react';
import * as Styled from './styles';

type Segment = typeof import('./segment').Segment;

export interface SegmentGroupProps {
	children: React.ReactElement<Segment>[] | React.ReactElement<Segment>;
	style?: import('react-native').ViewStyle;
	raised?: boolean;
	flexDirection?: 'row' | 'column';
	group?: 'first' | 'middle' | 'last';
	grow?: boolean;
}

export const SegmentGroup = ({
	children,
	flexDirection = 'column',
	style,
	raised = true,
	group,
	grow,
}: SegmentGroupProps): JSX.Element => {
	const count = React.Children.count(children);

	if (count === 1) {
		// @ts-ignore
		return <Styled.Group style={style}>{children}</Styled.Group>;
	}

	return (
		<Styled.Group style={style} raised={raised} flexDirection={flexDirection} grow={grow}>
			{React.Children.map(children, (child, index) => {
				if (React.isValidElement(child)) {
					const props: { group?: 'first' | 'middle' | 'last'; raised?: boolean } = {
						group: 'middle',
						raised: false,
					};
					if (index === 0 && group !== 'middle') {
						props.group = 'first';
					}
					if (index === count - 1 && group !== 'middle') {
						props.group = 'last';
					}
					// @ts-ignore
					return React.cloneElement(child as React.ReactElement<Segment>, props);
				}
				return [];
			})}
		</Styled.Group>
	);
};
