import { configure, getStorybookUI, addDecorator } from '@storybook/react-native';
import { withKnobs } from '@storybook/addon-ondevice-knobs';

import '@storybook/addon-ondevice-knobs/register';
import '@storybook/addon-ondevice-actions/register';

import { loadStories } from './storyLoader';

configure(() => {
	addDecorator(withKnobs);
	// Since require.context doesn't exist in metro bundler world, we have to
	// manually import files ending in *.stories.js
	loadStories();
}, module);

export default getStorybookUI({
	// Pass AsyncStorage below if you want Storybook to open your
	// last visited story after you close and re-open your app
	asyncStorage: null,
});
