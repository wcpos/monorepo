import * as React from 'react';
import { View } from 'react-native';
import { Segment, SegmentProps } from './segment';
import { SegmentGroup, SegmentGroupProps } from './group';

export default {
	title: 'Components/Segment',
	component: Segment,
	subcomponents: [SegmentGroup],
};

/**
 *
 */
export const basicUsage = ({ disabled, loading, raised }: SegmentProps) => (
	<Segment disabled={disabled} loading={loading} raised={raised}>
		Te eum doming eirmod, nominati pertinacia argumentum ad his.
	</Segment>
);

/**
 *
 */
export const group = ({ raised }: SegmentGroupProps) => (
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
export const groupWithOneSegment = ({ raised }: SegmentGroupProps) => (
	<View style={{ height: 400 }}>
		<Segment.Group raised={raised}>
			<Segment>One</Segment>
		</Segment.Group>
	</View>
);

/**
 *
 */
export const nestedGroup = ({ raised }: SegmentGroupProps) => (
	<Segment.Group raised={raised}>
		<Segment type="header">Top</Segment>
		<Segment.Group>
			<Segment>Nested Top</Segment>
			<Segment>Nested Middle</Segment>
			<Segment>Nested Bottom</Segment>
		</Segment.Group>
		<Segment.Group flexDirection="row">
			<Segment>Left</Segment>
			<Segment>Center</Segment>
			<Segment>Right</Segment>
		</Segment.Group>
		<Segment type="footer">Bottom</Segment>
	</Segment.Group>
);
