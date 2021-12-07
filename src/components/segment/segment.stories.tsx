import * as React from 'react';
import { View } from 'react-native';
import { Segment, SegmentProps } from './segment';
import { SegmentGroup, SegmentGroupProps } from './group';
import Text from '../text';
import Button from '../button';

export default {
	title: 'Components/Segment',
	component: Segment,
	subcomponents: [SegmentGroup],
};

/**
 *
 */
export const BasicUsage = (props: SegmentProps) => (
	<Segment {...props}>
		<Text>Te eum doming eirmod, nominati pertinacia argumentum ad his.</Text>
	</Segment>
);

/**
 *
 */
export const Group = (props: SegmentGroupProps) => (
	<View style={{ height: 400, width: 400 }}>
		<Segment.Group {...props} style={{ height: '100%' }}>
			<Segment>
				<Text>Top</Text>
			</Segment>
			<Segment>
				<Text>Middle</Text>
			</Segment>
			<Segment grow>
				<Text>Grow</Text>
			</Segment>
			<Segment>
				<Text>Middle</Text>
			</Segment>
			<Segment>
				<Text>Bottom</Text>
			</Segment>
		</Segment.Group>
	</View>
);

/**
 *
 */
export const HorizontalGroup = () => (
	<View style={{ height: 400, width: 400 }}>
		<Segment.Group direction="horizontal">
			<Segment>
				<Text>Top</Text>
			</Segment>
			<Segment>
				<Text>Middle</Text>
			</Segment>
			<Segment grow>
				<Text>Grow</Text>
			</Segment>
			<Segment>
				<Text>Middle</Text>
			</Segment>
			<Segment>
				<Text>Bottom</Text>
			</Segment>
		</Segment.Group>
	</View>
);

/**
 *
 */
export const GroupWithOneSegment = (props: SegmentGroupProps) => (
	<View style={{ height: 400 }}>
		<Segment.Group {...props}>
			<Segment>
				<Text>One</Text>
			</Segment>
		</Segment.Group>
	</View>
);

/**
 *
 */
export const NestedGroup = (props: SegmentGroupProps) => (
	<View style={{ height: 400, width: 400 }}>
		<Segment.Group {...props} style={{ height: '100%', width: '100%' }}>
			<Segment.Group direction="horizontal">
				<Segment>
					<Text>Left</Text>
				</Segment>
				<Segment grow>
					<Text>Center</Text>
				</Segment>
				<Segment>
					<Text>Right</Text>
				</Segment>
			</Segment.Group>
			<Segment.Group grow>
				<Segment>
					<Text>Nested Top</Text>
				</Segment>
				<Segment grow>
					<Text>Nested Middle</Text>
				</Segment>
				<Segment>
					<Text>Nested Bottom</Text>
				</Segment>
			</Segment.Group>
			<Segment.Group direction="horizontal">
				<Segment>
					<Text>Left</Text>
				</Segment>
				<Segment>
					<Text>Center</Text>
				</Segment>
				<Segment grow>
					<Text>Right</Text>
				</Segment>
			</Segment.Group>
		</Segment.Group>
	</View>
);

/**
 *
 */
export const SegmentWidthButtons = () => (
	<View style={{ height: 200, width: 400 }}>
		<Segment.Group style={{ height: '100%', width: '100%' }}>
			<Segment grow>
				<Text>Dialog</Text>
			</Segment>
			<Segment.Group direction="horizontal" style={{ height: 50 }}>
				<Segment style={{ padding: 0 }}>
					<Button title="Cancel" type="critical" size="fill" />
				</Segment>
				<Segment grow style={{ padding: 0 }}>
					<Button title="OK" type="success" size="fill" />
				</Segment>
			</Segment.Group>
		</Segment.Group>
	</View>
);
