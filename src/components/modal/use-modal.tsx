import * as React from 'react';
import { Modal, Close, Open } from './modal';

export const useModal = () => {
	const ref = React.useRef<typeof Modal>(null);

	const close = React.useCallback(() => {
		ref.current?.close();
	}, []);

	const open = React.useCallback(() => {
		ref.current?.open();
	}, []);

	return { ref, open, close };
};
