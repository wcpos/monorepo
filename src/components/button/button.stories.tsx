import React from 'react';
import { action } from '@storybook/addon-actions';
import { text, select, boolean } from '@storybook/addon-knobs';
import { storiesOf } from '@storybook/react';

import Button, { ButtonGroup } from './';

storiesOf('Button', module)
  /**
   *
   */
  .add('basic usage', () => (
    <Button
      onPress={action('pressed')}
      title={text('title', 'Click Me')}
      // type={select('type', ['solid', 'clear', 'outline'], 'solid')}
      loading={boolean('loading', false)}
      disabled={boolean('disabled', false)}
      raised={boolean('raised', false)}
    >
      {text('children', 'or, Click Me')}
    </Button>
  ))

  .add('basic group usage', () => (
    <ButtonGroup
      onPress={action('pressed')}
      selectedIndex={select('selectedIndex', [0, 1, 2], 0)}
      buttons={['Hello', 'World', 'Buttons']}
    />
  ));
