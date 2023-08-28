import { BehaviorSubject } from 'rxjs';

import { resource } from './hydrate-app-data';
const isWebApp = false;
const initialProps = {};
const initialPropsSubject = new BehaviorSubject(initialProps);

export { resource, isWebApp, initialProps, initialPropsSubject };
