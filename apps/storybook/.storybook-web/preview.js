import { addDecorator, addParameters } from '@storybook/react';
import { DocsContainer, DocsPage } from '@storybook/addon-docs/blocks';
import { create } from '@storybook/theming';
import decorator from './decorator'

// import '@wcpos/common/src/fonts/fonts.css';

// Option defaults
addParameters({
	docs: {
    container: DocsContainer,
    page: DocsPage,
  },
	options: {
		/**
		 * display the top-level grouping as a "root" in the sidebar
		 * @type {Boolean}
		 */
		showRoots: true,
		storySort: (a, b) => {
			const sectionA = a[1].id.split('-')[0];
			const sectionB = b[1].id.split('-')[0];

			return sectionA.localeCompare(sectionB);
		},
		theme: create({
			base: 'light',
			brandTitle: 'WCPOS',
			brandUrl: 'https://wcpos.com',
			// To control appearance:
			// brandImage: 'http://url.of/some.svg',
		}),
		panelPosition: 'bottom',
	},
});

addDecorator(decorator);
