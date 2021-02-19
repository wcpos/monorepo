/** @license React v16.6.1
 * react-cache.development.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined'
		? factory(exports, require('react'), require('scheduler'))
		: typeof define === 'function' && define.amd
		? define(['exports', 'react', 'scheduler'], factory)
		: factory((global.ReactCache = {}), global.React, global.Scheduler);
})(this, function (exports, React, scheduler) {
	/**
	 * Similar to invariant but only logs a warning if the condition is not met.
	 * This can be used to log issues in development environments in critical
	 * paths. Removing the logging code for production environments will keep the
	 * same logic and follow the same code paths.
	 */

	let warningWithoutStack = function () {};

	{
		warningWithoutStack = function (condition, format) {
			for (
				var _len = arguments.length, args = Array(_len > 2 ? _len - 2 : 0), _key = 2;
				_key < _len;
				_key++
			) {
				args[_key - 2] = arguments[_key];
			}

			if (format === undefined) {
				throw new Error(
					'`warningWithoutStack(condition, format, ...args)` requires a warning ' +
						'message argument'
				);
			}
			if (args.length > 8) {
				// Check before the condition to catch violations early.
				throw new Error('warningWithoutStack() currently supports at most 8 arguments.');
			}
			if (condition) {
				return;
			}
			if (typeof console !== 'undefined') {
				const argsWithFormat = args.map(function (item) {
					return `${item}`;
				});
				argsWithFormat.unshift(`Warning: ${format}`);

				// We intentionally don't use spread (or .apply) directly because it
				// breaks IE9: https://github.com/facebook/react/issues/13610
				Function.prototype.apply.call(console.error, console, argsWithFormat);
			}
			try {
				// --- Welcome to debugging React ---
				// This error was thrown as a convenience so that you can use this stack
				// to find the callsite that caused this warning to fire.
				let argIndex = 0;
				const message = `Warning: ${format.replace(/%s/g, function () {
					return args[argIndex++];
				})}`;
				throw new Error(message);
			} catch (x) {}
		};
	}

	const warningWithoutStack$1 = warningWithoutStack;

	function createLRU(limit) {
		let LIMIT = limit;

		// Circular, doubly-linked list
		let first = null;
		let size = 0;

		let cleanUpIsScheduled = false;

		function scheduleCleanUp() {
			if (cleanUpIsScheduled === false && size > LIMIT) {
				// The cache size exceeds the limit. Schedule a callback to delete the
				// least recently used entries.
				cleanUpIsScheduled = true;
				scheduler.unstable_scheduleCallback(cleanUp);
			}
		}

		function cleanUp() {
			cleanUpIsScheduled = false;
			deleteLeastRecentlyUsedEntries(LIMIT);
		}

		function deleteLeastRecentlyUsedEntries(targetSize) {
			// Delete entries from the cache, starting from the end of the list.
			if (first !== null) {
				const resolvedFirst = first;
				let last = resolvedFirst.previous;
				while (size > targetSize && last !== null) {
					const _onDelete = last.onDelete;
					const _previous = last.previous;
					last.onDelete = null;

					// Remove from the list
					last.previous = last.next = null;
					if (last === first) {
						// Reached the head of the list.
						first = last = null;
					} else {
						first.previous = _previous;
						_previous.next = first;
						last = _previous;
					}

					size -= 1;

					// Call the destroy method after removing the entry from the list. If it
					// throws, the rest of cache will not be deleted, but it will be in a
					// valid state.
					_onDelete();
				}
			}
		}

		function add(value, onDelete) {
			const entry = {
				value,
				onDelete,
				next: null,
				previous: null,
			};
			if (first === null) {
				entry.previous = entry.next = entry;
				first = entry;
			} else {
				// Append to head
				const last = first.previous;
				last.next = entry;
				entry.previous = last;

				first.previous = entry;
				entry.next = first;

				first = entry;
			}
			size += 1;
			return entry;
		}

		function update(entry, newValue) {
			entry.value = newValue;
		}

		function access(entry) {
			const { next } = entry;
			if (next !== null) {
				// Entry already cached
				const resolvedFirst = first;
				if (first !== entry) {
					// Remove from current position
					const _previous2 = entry.previous;
					_previous2.next = next;
					next.previous = _previous2;

					// Append to head
					const last = resolvedFirst.previous;
					last.next = entry;
					entry.previous = last;

					resolvedFirst.previous = entry;
					entry.next = resolvedFirst;

					first = entry;
				}
			} else {
				// Cannot access a deleted entry
				// TODO: Error? Warning?
			}
			scheduleCleanUp();
			return entry.value;
		}

		function setLimit(newLimit) {
			LIMIT = newLimit;
			scheduleCleanUp();
		}

		return {
			add,
			update,
			access,
			setLimit,
		};
	}

	const Pending = 0;
	const Resolved = 1;
	const Rejected = 2;

	const { ReactCurrentDispatcher } = React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;

	function readContext(Context, observedBits) {
		const dispatcher = ReactCurrentDispatcher.current;
		if (dispatcher === null) {
			throw new Error(
				'react-cache: read and preload may only be called from within a ' +
					"component's render. They are not supported in event handlers or " +
					'lifecycle methods.'
			);
		}
		return dispatcher.readContext(Context, observedBits);
	}

	function identityHashFn(input) {
		{
			!(
				typeof input === 'string' ||
				typeof input === 'number' ||
				typeof input === 'boolean' ||
				input === undefined ||
				input === null
			)
				? warningWithoutStack$1(
						false,
						'Invalid key type. Expected a string, number, symbol, or boolean, ' +
							'but instead received: %s' +
							'\n\nTo use non-primitive values as keys, you must pass a hash ' +
							'function as the second argument to createResource().',
						input
				  )
				: void 0;
		}
		return input;
	}

	const CACHE_LIMIT = 500;
	const lru = createLRU(CACHE_LIMIT);

	const entries = new Map();

	const CacheContext = React.createContext(null);

	function accessResult(resource, fetch, input, key) {
		let entriesForResource = entries.get(resource);
		if (entriesForResource === undefined) {
			entriesForResource = new Map();
			entries.set(resource, entriesForResource);
		}
		const entry = entriesForResource.get(key);
		if (entry === undefined) {
			const thenable = fetch(input);
			thenable.then(
				function (value) {
					if (newResult.status === Pending) {
						const resolvedResult = newResult;
						resolvedResult.status = Resolved;
						resolvedResult.value = value;
					}
				},
				function (error) {
					if (newResult.status === Pending) {
						const rejectedResult = newResult;
						rejectedResult.status = Rejected;
						rejectedResult.value = error;
					}
				}
			);
			var newResult = {
				status: Pending,
				value: thenable,
			};
			const newEntry = lru.add(newResult, deleteEntry.bind(null, resource, key));
			entriesForResource.set(key, newEntry);
			return newResult;
		}
		return lru.access(entry);
	}

	function deleteEntry(resource, key) {
		const entriesForResource = entries.get(resource);
		if (entriesForResource !== undefined) {
			entriesForResource.delete(key);
			if (entriesForResource.size === 0) {
				entries.delete(resource);
			}
		}
	}

	function unstable_createResource(fetch, maybeHashInput) {
		const hashInput = maybeHashInput !== undefined ? maybeHashInput : identityHashFn;

		var resource = {
			read(input) {
				// react-cache currently doesn't rely on context, but it may in the
				// future, so we read anyway to prevent access outside of render.
				readContext(CacheContext);
				const key = hashInput(input);
				const result = accessResult(resource, fetch, input, key);
				switch (result.status) {
					case Pending: {
						const suspender = result.value;
						throw suspender;
					}
					case Resolved: {
						const _value = result.value;
						return _value;
					}
					case Rejected: {
						const error = result.value;
						throw error;
					}
					default:
						// Should be unreachable
						return undefined;
				}
			},
			preload(input) {
				// react-cache currently doesn't rely on context, but it may in the
				// future, so we read anyway to prevent access outside of render.
				readContext(CacheContext);
				const key = hashInput(input);
				accessResult(resource, fetch, input, key);
			},
		};
		return resource;
	}

	function unstable_setGlobalCacheLimit(limit) {
		lru.setLimit(limit);
	}

	exports.unstable_createResource = unstable_createResource;
	exports.unstable_setGlobalCacheLimit = unstable_setGlobalCacheLimit;

	Object.defineProperty(exports, '__esModule', { value: true });
});
