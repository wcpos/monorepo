import * as React from 'react';
import { View } from 'react-native';
import { boolean, select } from '@storybook/addon-knobs';
import Segment, { SegmentGroup } from '.';

export default {
	title: 'Components/Segment',
};

/**
 *
 */
export const basicUsage = () => (
	<Segment
		disabled={boolean('disabled', false)}
		loading={boolean('loading', false)}
		raised={boolean('raised', false)}
	>
		Te eum doming eirmod, nominati pertinacia argumentum ad his.
	</Segment>
);

/**
 *
 */
export const group = () => (
	<View style={{ height: 400 }}>
		<Segment.Group raised={boolean('raised', true)}>
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
export const nestedGroup = () => (
	<Segment.Group raised={boolean('raised', true)}>
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
