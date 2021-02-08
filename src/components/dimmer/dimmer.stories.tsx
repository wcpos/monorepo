import * as React from 'react';
import { action } from '@storybook/addon-actions';
import Dimmer from '.';

export default {
	title: 'Components/Dimmer',
};

export const basicUsage = () => <Dimmer onPress={action('Dimmer pressed')} />;
