import * as React from 'react';

import { IconButton } from '@wcpos/components/src/icon-button';

export const ScannerButton = () => {
	// const [device, setDevice] = React.useState(null);
	// const [connected, setConnected] = React.useState(false);

	/**
	 *
	 */
	const connectToDevice = React.useCallback(async () => {
		if ('hid' in navigator) {
			try {
				const devices = await navigator.hid.requestDevice({
					filters: [],
				});
				if (devices.length > 0) {
					const device = devices[0];
					await device.open();
					device.addEventListener('inputreport', (event) => {
						console.log('Input report event fired');
						console.log('Report ID:', event.reportId);
						console.log('Data length:', event.data.byteLength);
						const { data } = event;
						let chars = '';

						for (let i = 0; i < data.byteLength; i++) {
							const byte = data.getUint8(i);
							const char = String.fromCharCode(byte);
							chars += char;
						}
						console.log(chars);
					});
					// setConnected(true);
				}
			} catch (error) {
				console.error('Failed to connect to HID device:', error);
			}
		}
	}, []);

	// /**
	//  *
	//  */
	// const scanner = React.useMemo(async () => {
	// 	if (!device) return;
	// 	if (device.opened) {
	// 		// setConnected(true);
	// 		return device;
	// 	} else {
	// 		try {
	// 			await device.open();
	// 			// setConnected(true);
	// 			return device;
	// 		} catch (error) {
	// 			console.error('Failed to open HID device:', error);
	// 		}
	// 	}
	// }, [device]);

	// /**
	//  *
	//  */
	// React.useEffect(() => {
	// 	if (!scanner || !scanner.opened) return;
	// 	debugger;

	// 	scanner.oninputreport = (event) => {
	// 		debugger;
	// 		const { data } = event;
	// 		let chars = '';

	// 		for (let i = 0; i < data.byteLength; i++) {
	// 			const byte = data.getUint8(i);
	// 			const char = String.fromCharCode(byte);
	// 			chars += char;
	// 		}
	// 		console.log(chars);
	// 	};

	// 	return () => {
	// 		scanner.removeEventListener('inputreport');
	// 	};
	// }, [scanner]);

	return (
		<IconButton
			// className={device ? 'text-base' : 'text-muted'}
			name="barcode"
			onPress={connectToDevice}
		/>
	);
};
