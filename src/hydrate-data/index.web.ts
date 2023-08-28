import { BehaviorSubject } from 'rxjs';

import { getAppDataResource } from './hydrate-web-data';

type InitialProps = import('../types').InitialProps;
let initialProps = {} as InitialProps;
if (window && window.initialProps) {
	initialProps = window.initialProps;
} else {
	throw new Error('No initialProps found');
}

/**
 * For web app, we need to be able to trigger a change to the store
 * There might be a better way to do this, but for now we'll just use a BehaviorSubject
 */
const initialPropsSubject = new BehaviorSubject(initialProps);
const initialProps$ = initialPropsSubject.asObservable();

const resource = getAppDataResource(initialProps$);
const isWebApp = true;

export { isWebApp, initialProps, resource, initialPropsSubject };
