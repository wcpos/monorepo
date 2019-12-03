import React from 'react';
import { storiesOf } from '@storybook/react';

import * as Format from './';

storiesOf('Format', module)
	/**
	 *
	 */
	.add('name', () => <Format.Name firstName="Bob" lastName="Doe" />)

	/**
	 *
	 */
	.add('number', () => <Format.Number prefix="$">3.99</Format.Number>)

	/**
	 *
	 */
	.add('list', () => <Format.List array={['one', 'two', 'three']} />);
