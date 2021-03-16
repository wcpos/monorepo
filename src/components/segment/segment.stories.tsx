import * as React from 'react';
import { View } from 'react-native';
import { Segment, ISegmentProps } from './segment';
import { SegmentGroup, ISegmentGroupProps } from './group';

export default {
	title: 'Components/Segment',
	component: Segment,
	subcomponents: [SegmentGroup],
};

/**
 *
 */
export const basicUsage = ({ disabled, loading, raised }: ISegmentProps) => (
	<Segment disabled={disabled} loading={loading} raised={raised}>
		Te eum doming eirmod, nominati pertinacia argumentum ad his.
	</Segment>
);

/**
 *
 */
export const group = ({ raised }: ISegmentGroupProps) => (
	<View style={{ height: 400 }}>
		<Segment.Group raised={raised}>
			<Segment>Top</Segment>
			<Segment>Middle</Segment>
			<Segment grow>Middle</Segment>
			<Segment>Middle</Segment>
			<Segment>Bottom</Segment>
		</Segment.Group>
	</View>
);

/**
 *
 */
export const groupWithOneSegment = ({ raised }: ISegmentGroupProps) => (
	<View style={{ height: 400 }}>
		<Segment.Group raised={raised}>
			<Segment>One</Segment>
		</Segment.Group>
	</View>
);

/**
 *
 */
export const nestedGroup = ({ raised }: ISegmentGroupProps) => (
	<Segment.Group raised={raised}>
		<Segment type="header">Top</Segment>
		<Segment.Group>
			<Segment>Nested Top</Segment>
			<Segment>Nested Middle</Segment>
			<Segment>Nested Bottom</Segment>
		</Segment.Group>
		<Segment.Group direction="horizontal">
			<Segment>Left</Segment>
			<Segment>Center</Segment>
			<Segment>Right</Segment>
		</Segment.Group>
		<Segment type="footer">Bottom</Segment>
	</Segment.Group>
);
