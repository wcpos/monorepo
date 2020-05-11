import React from 'react';
import { boolean, select } from '@storybook/addon-knobs';
import Segment, { SegmentGroup } from './';

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
	<SegmentGroup raised={boolean('raised', true)}>
		<Segment>Top</Segment>
		<Segment>Middle</Segment>
		<Segment>Middle</Segment>
		<Segment>Middle</Segment>
		<Segment>Bottom</Segment>
	</SegmentGroup>
);

/**
 *
 */
export const nestedGroup = () => (
	<SegmentGroup raised={boolean('raised', true)}>
		<Segment type="header">Top</Segment>
		<SegmentGroup>
			<Segment>Nested Top</Segment>
			<Segment>Nested Middle</Segment>
			<Segment>Nested Bottom</Segment>
		</SegmentGroup>
		<SegmentGroup>
			<Segment>Left</Segment>
			<Segment>Center</Segment>
			<Segment>Right</Segment>
		</SegmentGroup>
		<Segment type="footer">Bottom</Segment>
	</SegmentGroup>
);
