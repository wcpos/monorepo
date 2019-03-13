import React from 'react';

// import { action } from '@storybook/addon-actions';
// import { text } from '@storybook/addon-knobs';
import { storiesOf } from '@storybook/react';

import Calculator from './';

storiesOf('Calculator', module)
  /**
   *
   */
  .add('basic usage', () => <Calculator />);
