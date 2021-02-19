import { unstable_createResource } from './react-cache';

// @ts-ignore
let createResource: any;

if (unstable_createResource) {
	createResource = unstable_createResource;
}

export { createResource };
