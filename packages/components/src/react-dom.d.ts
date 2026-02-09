declare module 'react-dom' {
	import { ReactNode } from 'react';
	export function createPortal(children: ReactNode, container: Element | DocumentFragment): ReactNode;
}
