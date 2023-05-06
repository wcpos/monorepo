import * as React from 'react';

import axios from 'axios';
import { MinQueue } from 'heapify';

import useRestHttpClient from '../use-rest-http-client';

const minQueue = new MinQueue(1000);
const requestMap = {};
let keyCounter = 0;
let processing = false;

/**
 * Priorities
 *
 * 10 - Tax
 * 20 - Product
 * 30 - Customer
 * 40 - Order
 * 50 - Product Search
 * 60 - Customer Search
 * 70 - Order Search
 * 80 - Variations
 * 90 - Variation Search
 * 100 - Product Category
 * 110 - Product Tag
 */

export const useQueuedRestRequest = () => {
	const http = useRestHttpClient();
	const queue = React.useRef(minQueue);
	const [queueState, setQueueState] = React.useState(queue.current);
	const [batchSize, setBatchSize] = React.useState(5); // Initial batch size
	const [trigger, setTrigger] = React.useState(false); // Add this line

	// Process a single request from the queue
	const processRequest = async ({ priority, request, resolve, reject }) => {
		try {
			const response = await http[request.method](request.url, request.config);
			resolve(response); // Resolve with the response data
		} catch (error) {
			reject(error); // Reject with the error
		}
	};

	// Process a batch of requests from the queue
	const processBatch = async () => {
		const batch = [];

		// Dequeue requests up to the current batch size
		while (queue.current.size !== 0 && batch.length < batchSize) {
			const key = queue.current.pop();
			const request = requestMap[key];
			delete requestMap[key];
			batch.push(request);
		}

		// Process all requests in the batch in parallel
		await Promise.all(
			batch.map((request) => {
				return processRequest(request);
			})
		);

		// Continue processing the next batch
		processing = false;
		processNextRequest();
	};

	// Process the next batch of requests in the queue
	const processNextRequest = async () => {
		if (queue.current.size !== 0 && !processing) {
			processing = true;

			const startTime = Date.now();
			await processBatch();
			const elapsedTime = Date.now() - startTime;

			// Adjust the batch size based on the time taken to complete the batch
			if (elapsedTime < 1000) {
				setBatchSize(batchSize + 1); // Increase the batch size if the batch was completed quickly
			} else if (elapsedTime > 2000 && batchSize > 1) {
				setBatchSize(batchSize - 1); // Decrease the batch size if the batch took too long
			}
		}
	};

	const enqueueRequest = (method, url, config, priority, customTag = null) => {
		// Check if an identical request is already in the queue
		const existingRequest = Object.values(requestMap).find((item) => {
			return (
				item.priority === priority &&
				item.request.method === method &&
				item.request.url === url &&
				JSON.stringify(item.request.config) === JSON.stringify(config)
			);
		});

		if (existingRequest) {
			// Return the existing promise
			return existingRequest.promise;
		}

		// Cancel the previous request with the same custom tag if applicable
		// if (customTag) {
		// 	const abortController = new AbortController();
		// 	config.signal = abortController.signal;

		// 	const existingRequestOfTypeIndex = Object.values(requestMap.current).findIndex(
		// 		(item) => item.request.customTag === customTag
		// 	);

		// 	if (existingRequestOfTypeIndex >= 0) {
		// 		// Cancel the previous request with the same custom tag
		// 		const existingRequest = Object.values(requestMap.current)[existingRequestOfTypeIndex];
		// 		existingRequest.request.abortController.abort();
		// 	}
		// }

		const key = keyCounter++;

		const promise = new Promise((resolve, reject) => {
			// Create the promise here
			// Enqueue the new request along with the resolve and reject functions
			queue.current.push(key, priority);
			requestMap[key] = {
				priority,
				request: { method, url, config, customTag },
				resolve,
				reject,
			};
			setQueueState(queue.current);
		});

		requestMap[key]['promise'] = promise; // Store the created promise in the request object
		setTrigger((prev) => !prev); // Add this line to trigger the effect
		return promise; // Return the created promise
	};

	// Effect to process the next batch of requests in the queue when the queue changes
	React.useEffect(() => {
		processNextRequest();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [queueState, trigger]);

	// Priority HTTP client API
	const priorityHttpClient = React.useMemo(
		() => ({
			get: (url, config, priority, requestTag) =>
				enqueueRequest('get', url, config, priority, requestTag),
			post: (url, config, priority, requestTag) =>
				enqueueRequest('post', url, config, priority, requestTag),
			put: (url, config, priority, requestTag) =>
				enqueueRequest('put', url, config, priority, requestTag),
			patch: (url, config, priority, requestTag) =>
				enqueueRequest('patch', url, config, priority, requestTag),
			delete: (url, config, priority, requestTag) =>
				enqueueRequest('delete', url, config, priority, requestTag),
		}),
		[]
	);

	return priorityHttpClient;
};
