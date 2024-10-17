import * as React from 'react';

/**
 * Custom hook to connect to a barcode scanner using the Web Serial API
 */
export const useWebSerialBarcodeScanner = (options = {}) => {
	const { debug = false, baudRate = 9600 } = options;

	const [port, setPort] = React.useState(null);
	const [connected, setConnected] = React.useState(false);
	// const [barcodeData, setBarcodeData] = React.useState(null);

	const readerRef = React.useRef(null);
	const readLoopRef = React.useRef(null);
	const abortControllerRef = React.useRef(null);

	/**
	 * Connect to the serial device
	 */
	const connect = async () => {
		try {
			if (debug) console.log('Requesting serial port...');
			const port = await navigator.serial.requestPort();
			if (debug) console.log('Port selected by user:', port);

			if (port) {
				if (debug) console.log('Opening port:', port);
				await openPort(port);
			} else {
				if (debug) console.log('No port selected by the user.');
			}
		} catch (error) {
			console.error('Could not connect!', error);
		}
	};

	/**
	 * Reconnect to the previously used serial device
	 */
	const reconnect = async () => {
		try {
			if (debug) console.log('Attempting to reconnect to previously authorized ports...');
			const ports = await navigator.serial.getPorts();
			if (debug) console.log('Previously authorized ports:', ports);

			if (ports.length > 0) {
				if (debug) console.log('Reconnecting to port:', ports[0]);
				await openPort(ports[0]);
			} else {
				if (debug) console.log('No ports to reconnect to.');
			}
		} catch (error) {
			console.error('Could not reconnect!', error);
		}
	};

	/**
	 * Disconnect from the serial device
	 */
	const disconnect = async () => {
		if (port) {
			if (debug) console.log('Disconnecting from port:', port);

			if (readerRef.current) {
				if (debug) console.log('Cancelling reader...');
				await readerRef.current.cancel();
				readerRef.current.releaseLock();
				readerRef.current = null;
			}

			if (abortControllerRef.current) {
				abortControllerRef.current.abort();
				abortControllerRef.current = null;
			}

			await port.close();
			if (debug) console.log('Port closed.');
			setPort(null);
			setConnected(false);
		} else {
			if (debug) console.log('No port is currently connected.');
		}
	};

	/**
	 * Open the serial port and set up the reader
	 */
	const openPort = async (portToOpen) => {
		try {
			await portToOpen.open({ baudRate });
			if (debug) console.log('Port opened:', portToOpen);

			setPort(portToOpen);
			setConnected(true);

			// Set up a reader to read data
			const textDecoder = new TextDecoderStream();
			const readableStreamClosed = portToOpen.readable.pipeTo(textDecoder.writable);
			const reader = textDecoder.readable.getReader();
			readerRef.current = reader;

			abortControllerRef.current = new AbortController();
			const signal = abortControllerRef.current.signal;

			readLoopRef.current = readLoop(reader, signal);
		} catch (error) {
			console.error('Error opening port:', error);
		}
	};

	/**
	 * Read loop to continuously read data from the serial port
	 */
	const readLoop = async (reader, signal) => {
		try {
			while (true) {
				const { value, done } = await reader.read();
				if (done) {
					if (debug) console.log('Reader has been cancelled.');
					break;
				}
				if (value) {
					if (debug) console.log('Received data:', value);
					handleIncomingData(value);
				}
				if (signal.aborted) {
					if (debug) console.log('Read loop aborted.');
					break;
				}
			}
		} catch (error) {
			if (debug) console.error('Error in read loop:', error);
		} finally {
			reader.releaseLock();
		}
	};

	/**
	 * Handle incoming data from the serial port
	 */
	const handleIncomingData = (data) => {
		// Process the data as needed
		// For example, accumulate data until a newline character
		// Uncomment and implement barcode data processing if needed
		/*
    bufferRef.current += data;
    if (data.includes('\n')) {
      // Process the complete barcode data
      const barcode = bufferRef.current.trim();
      bufferRef.current = '';
      if (debug) console.log('Complete barcode data:', barcode);
      setBarcodeData(barcode);
    }
    */
	};

	/**
	 * Clean up on unmount
	 */
	React.useEffect(() => {
		return () => {
			if (debug) console.log('Cleaning up...');
			disconnect();
		};
	}, [debug]);

	return {
		connect,
		disconnect,
		reconnect,
		connected,
		port,
		// barcodeData,
	};
};
