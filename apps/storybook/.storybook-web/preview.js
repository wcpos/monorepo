import { addDecorator, addParameters } from '@storybook/react';
// import { DocsContainer, DocsPage } from '@storybook/addon-docs/blocks';
import decorator from './decorator'

// import '@wcpos/common/src/fonts/fonts.css';

// Option defaults
addParameters({
	// docs: {
  //   container: DocsContainer,
  //   page: DocsPage,
  // },
	options: {
		/**
		 * display the top-level grouping as a "root" in the sidebar
		 * @type {Boolean}
		 */
		// storySort: (a, b) => {
		// 	const sectionA = a[1].id.split('-')[0];
		// 	const sectionB = b[1].id.split('-')[0];

		// 	return sectionA.localeCompare(sectionB);
		// },
		panelPosition: 'bottom',
	},
});

addDecorator(decorator);
