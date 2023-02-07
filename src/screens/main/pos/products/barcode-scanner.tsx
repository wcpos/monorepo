import * as React from 'react';
import { Text, View, StyleSheet, Button } from 'react-native';

import { BarCodeScanner } from 'expo-barcode-scanner';

import Icon from '@wcpos/components/src/icon';
import Popover from '@wcpos/components/src/popover';
import useSnackbar from '@wcpos/components/src/snackbar';

const Scanner = () => {
	const [hasPermission, setHasPermission] = React.useState(null);
	const [scanned, setScanned] = React.useState(false);
	const addSnackbar = useSnackbar();

	React.useEffect(() => {
		const getBarCodeScannerPermissions = async () => {
			const { status } = await BarCodeScanner.requestPermissionsAsync();
			setHasPermission(status === 'granted');
		};

		getBarCodeScannerPermissions();
	}, []);

	const handleBarCodeScanned = ({ type, data }) => {
		setScanned(true);
		addSnackbar({ message: `Barcode with type ${type} and data ${data} has been scanned!` });
	};

	if (hasPermission === null) {
		return <Text>Requesting for camera permission</Text>;
	}
	if (hasPermission === false) {
		return <Text>No access to camera</Text>;
	}

	return (
		<View>
			<BarCodeScanner
				onBarCodeScanned={scanned ? undefined : handleBarCodeScanned}
				style={StyleSheet.absoluteFillObject}
			/>
			{scanned && <Button title="Tap to Scan Again" onPress={() => setScanned(false)} />}
		</View>
	);
};

const ScannerButton = () => {
	return (
		<Popover content={<Scanner />} placement="bottom-start">
			<Icon name="sliders" />
		</Popover>
	);
};

export default ScannerButton;
