import { getAppDataResource } from './hydrate-web-data';

type InitialProps = import('../types').InitialProps;
let initialProps = {} as InitialProps;
if (window && window.initialProps) {
	initialProps = window.initialProps;
} else {
	throw new Error('No initialProps found');
}

const resource = getAppDataResource(initialProps);
const isWebApp = true;

export { isWebApp, initialProps, resource };
