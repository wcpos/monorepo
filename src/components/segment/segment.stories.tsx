import React from 'react';

import { storiesOf } from '@storybook/react';
import { boolean, select } from '@storybook/addon-knobs';

import Segment, { SegmentGroup } from './';

storiesOf('Segment', module)
  /**
   * Segment
   */
  .add('basic usage', () => (
    <Segment
      disabled={boolean('disabled', false)}
      loading={boolean('loading', false)}
      raised={boolean('raised', false)}
    >
      Te eum doming eirmod, nominati pertinacia argumentum ad his.
    </Segment>
  ))

  /**
   * Segment.Group
   */
  .add('vertical', () => (
    <div>
      <Segment type="vertical">
        Te eum doming eirmod, nominati pertinacia argumentum ad his.
      </Segment>
      <Segment type="vertical">Pellentesque habitant morbi tristique senectus.</Segment>
      <Segment type="vertical">
        Eu quo homero blandit intellegebat. Incorrupte consequuntur mei id.
      </Segment>
    </div>
  ))

  /**
   * Segment.Group
   */
  .add('group', () => (
    <SegmentGroup>
      <Segment>Top</Segment>
      <Segment>Middle</Segment>
      <Segment>Middle</Segment>
      <Segment>Middle</Segment>
      <Segment>Bottom</Segment>
    </SegmentGroup>
  ))

  /**
   * Segment.Group
   */
  .add('nested group', () => (
    <SegmentGroup>
      <Segment>Top</Segment>
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
      <Segment>Bottom</Segment>
    </SegmentGroup>
  ));
