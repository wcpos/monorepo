import React from 'react';

// import { text } from '@storybook/addon-knobs';
import { storiesOf } from '@storybook/react';

import Input from './';

storiesOf('Input', module)
  /**
   *
   */
  .add('basic usage', () => <Input />);
