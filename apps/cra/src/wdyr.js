import React from 'react';

/**
 * Add WHy Did You Render for development optimisation
 *
 * https://github.com/welldone-software/why-did-you-render
 */
if (process.env.NODE_ENV === 'development') {
	// eslint-disable-next-line
	const whyDidYouRender = require('@welldone-software/why-did-you-render');
	whyDidYouRender(React, {
		trackAllPureComponents: true,
	});
}
