import * as React from 'react';

/**
 * Web Serial API types (not in standard TypeScript lib)
 */
interface SerialPort {
	open(options: { baudRate: number }): Promise<void>;
	close(): Promise<void>;
	readable: ReadableStream;
}

interface Serial {
	requestPort(): Promise<SerialPort>;
	getPorts(): Promise<SerialPort[]>;
}

interface SerialOptions {
	debug?: boolean;
	baudRate?: number;
}

/**
 * Custom hook to connect to a barcode scanner using the Web Serial API
 */
export const useWebSerialBarcodeScanner = (options: SerialOptions = {}) => {
	const { debug = false, baudRate = 9600 } = options;

	const [port, setPort] = React.useState<SerialPort | null>(null);
	const [connected, setConnected] = React.useState(false);
	// const [barcodeData, setBarcodeData] = React.useState(null);

	const readerRef = React.useRef<ReadableStreamDefaultReader<string> | null>(null);
	const readLoopRef = React.useRef<Promise<void> | null>(null);
	const abortControllerRef = React.useRef<AbortController | null>(null);

	/**
	 * Connect to the serial device
	 */
	const connect = async () => {
		try {
			if (debug) console.log('Requesting serial port...');
			const serial = (navigator as unknown as { serial: Serial }).serial;
			const selectedPort = await serial.requestPort();
			if (debug) console.log('Port selected by user:', selectedPort);

			if (selectedPort) {
				if (debug) console.log('Opening port:', selectedPort);
				await openPort(selectedPort);
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
			const serial = (navigator as unknown as { serial: Serial }).serial;
			const ports = await serial.getPorts();
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
	const openPort = async (portToOpen: SerialPort) => {
		try {
			await portToOpen.open({ baudRate });
			if (debug) console.log('Port opened:', portToOpen);

			setPort(portToOpen);
			setConnected(true);

			// Set up a reader to read data
			const textDecoder = new TextDecoderStream();
			portToOpen.readable.pipeTo(textDecoder.writable);
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
	const readLoop = async (reader: ReadableStreamDefaultReader<string>, signal: AbortSignal) => {
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
	const handleIncomingData = (_data: string) => {
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
	 * Clean up on unmount only — debug and disconnect are stable refs/closures
	 */
	React.useEffect(() => {
		return () => {
			disconnect();
		};
	}, []);

	return {
		connect,
		disconnect,
		reconnect,
		connected,
		port,
		// barcodeData,
	};
};
