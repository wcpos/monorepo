import React from 'react';

import { storiesOf } from '@storybook/react';
import { select } from '@storybook/addon-knobs';

import Loader from './';

storiesOf('Loader', module)
  /**
   *
   */
  .add('basic usage', () => <Loader size={select('size', ['small', 'large'], 'small')} />);
