import React from 'react';

import { action } from '@storybook/addon-actions';
import { storiesOf } from '@storybook/react';

import ErrorBoundary from '.';

function BuggyComponent() {
  throw new Error('The Error message');
  return <div>Dum Dum</div>;
}

storiesOf('Error', module)
  /**
   *
   */
  .add('default', () => (
    <ErrorBoundary onError={action('error handler')}>
      <BuggyComponent />
    </ErrorBoundary>
  ));
