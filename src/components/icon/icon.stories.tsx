import React from 'react';

import { action } from '@storybook/addon-actions';
import { boolean, text, select } from '@storybook/addon-knobs';
import { storiesOf } from '@storybook/react';

import Icon from './';
import iconsMap from './icons.json';
const iconNames = Object.keys(iconsMap);

import Table from '../table';

storiesOf('Icon', module)
  /**
   *
   */
  .add('basic usage', () => (
    <Icon
      name={select('name', iconNames, 'cog')}
      // loading={boolean('loading', false)}
      disabled={boolean('disabled', false)}
      raised={boolean('raised', false)}
    />
  ))

  /**
   *
   */
  .add('all icons', () => (
    <Table
      columns={[
        { key: 'name', label: 'Name', cellDataGetter: ({ rowData }) => rowData },
        { key: 'icon', label: 'Icon', cellRenderer: ({ rowData }) => <Icon name={rowData} /> },
      ]}
      items={iconNames}
    />
  ))

  /**
   *
   */
  .add('icon button', () => (
    <Icon
      name={text('name', 'cog')}
      onPress={action('pressed')}
      // loading={boolean('loading', false)}
      disabled={boolean('disabled', false)}
      raised={boolean('raised', false)}
    />
  ));
