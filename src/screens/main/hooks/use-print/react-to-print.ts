import { useCallback } from 'react';

import type {
	Font,
	UseReactToPrintFn,
	UseReactToPrintHookContent,
	UseReactToPrintOptions,
	HandlePrintWindowOnLoadData,
	MarkLoaded,
	LogMessagesArgs,
	GetContentNodesArgs,
	ContentNode,
} from './types';

const DEFAULT_PAGE_STYLE = `
    @page {
        /* Remove browser default header (title) and footer (url) */
        margin: 0;
    }
    @media print {
        body {
            /* Tell browsers to print background colors */
            color-adjust: exact; /* Firefox. This is an older version of "print-color-adjust" */
            print-color-adjust: exact; /* Firefox/Safari */
            -webkit-print-color-adjust: exact; /* Chrome/Safari/Edge/Opera */
        }
    }
`;

/** Logs messages to the console. Uses `console.error` by default. */
export function logMessages({
	level = 'error',
	messages,
	suppressErrors = false,
}: LogMessagesArgs) {
	if (!suppressErrors) {
		if (level === 'error') {
			console.error(messages); // eslint-disable-line no-console
		} else if (level === 'warning') {
			console.warn(messages); // eslint-disable-line no-console
		} else if (level === 'debug') {
			console.debug(messages); // eslint-disable-line no-console
		}
	}
}

function removePrintIframe(
	preserveAfterPrint: UseReactToPrintOptions['preserveAfterPrint'],
	force?: boolean
) {
	if (force || !preserveAfterPrint) {
		const documentPrintWindow = document.getElementById('printWindow');

		if (documentPrintWindow) {
			document.body.removeChild(documentPrintWindow);
		}
	}
}

/**
 * Starts the main printing process. This includes determining if we are running the default
 * printing process or using a custom `print` function, handling updating the print windows's title
 * if a `documentTitle` is set, calling `onAfterPrint`, and removing the print iframe based on the
 * value of `preserveAfterPrint`.
 */
function startPrint(
	printWindow: HTMLIFrameElement,
	options: UseReactToPrintOptions,
	isExternalURL = false
) {
	const { documentTitle, onAfterPrint, onPrintError, preserveAfterPrint, print, suppressErrors } =
		options;

	setTimeout(() => {
		try {
			if (printWindow.contentWindow) {
				printWindow.contentWindow.focus(); // Needed for IE 11

				if (isExternalURL) {
					// Handle external URL case
					try {
						printWindow.contentWindow.print();

						// We cannot reliably detect when the user has completed printing
						// due to cross-origin restrictions, so we call onAfterPrint immediately
						onAfterPrint?.();
						removePrintIframe(preserveAfterPrint);
					} catch (error) {
						// Handle cross-origin errors
						logMessages({
							messages: ['Unable to print the external URL due to cross-origin restrictions.'],
							suppressErrors,
						});
						onPrintError?.('startPrint', error);
					}
				} else {
					// Existing logic for printing from ref content
					// ... (rest of your existing startPrint logic)
				}
			} else {
				logMessages({
					messages: [
						'Cannot access iframe contentWindow. Printing may not be possible due to cross-origin restrictions.',
					],
					suppressErrors,
				});
				onPrintError?.('startPrint', new Error('Cannot access iframe contentWindow'));
			}
		} catch (error) {
			onPrintError?.('startPrint', error);
		}
	}, 500);
}

function collectElements(root: HTMLElement): HTMLElement[] {
	const elements: HTMLElement[] = [];
	const walker: TreeWalker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null);

	let element: Node | null = walker.nextNode();
	while (element) {
		elements.push(element as HTMLElement);
		element = walker.nextNode();
	}

	return elements;
}

function cloneShadowRoots(sourceNode: Node, targetNode: Node, suppressErrors: boolean): void {
	const sourceElements = collectElements(sourceNode as HTMLElement);
	const targetElements = collectElements(targetNode as HTMLElement);

	if (sourceElements.length !== targetElements.length) {
		logMessages({
			messages: [
				'When cloning shadow root content, source and target elements have different size. `onBeforePrint` likely resolved too early.',
				sourceNode,
				targetNode,
			],
			suppressErrors,
		});
		return;
	}

	for (let i = 0; i < sourceElements.length; i++) {
		const sourceElement = sourceElements[i];
		const targetElement = targetElements[i];

		const shadowRoot = sourceElement.shadowRoot;
		if (shadowRoot !== null) {
			const copiedShadowRoot = targetElement.attachShadow({ mode: shadowRoot.mode });

			copiedShadowRoot.innerHTML = shadowRoot.innerHTML;

			// Recursively clone any nested Shadow DOMs within this Shadow DOM content
			cloneShadowRoots(shadowRoot, copiedShadowRoot, suppressErrors);
		}
	}
}

/**
 * Handles loading resources into the print window and copying over various DOM elements that
 * require special handling. Continuously checks
 */
function handlePrintWindowOnLoad(
	printWindow: HTMLIFrameElement,
	markLoaded: MarkLoaded,
	data: HandlePrintWindowOnLoadData,
	options: UseReactToPrintOptions
) {
	const {
		contentNode,
		clonedContentNode,
		clonedImgNodes,
		clonedVideoNodes,
		numResourcesToLoad,
		originalCanvasNodes,
	} = data;

	const {
		bodyClass,
		fonts,
		ignoreGlobalStyles,
		pageStyle,
		nonce,
		suppressErrors,
		copyShadowRoots,
	} = options;

	// Some agents, such as IE11 and Enzyme (as of 2 Jun 2020) continuously call the
	// `onload` callback. This ensures that it is only called once.
	printWindow.onload = null;

	const domDoc = printWindow.contentDocument || printWindow.contentWindow?.document;

	if (domDoc) {
		const appendedContentNode = domDoc.body.appendChild(clonedContentNode);
		if (copyShadowRoots) {
			cloneShadowRoots(contentNode, appendedContentNode, !!suppressErrors);
		}

		if (fonts) {
			if (printWindow.contentDocument?.fonts && printWindow.contentWindow?.FontFace) {
				fonts.forEach((font) => {
					const fontFace = new FontFace(font.family, font.source, {
						weight: font.weight,
						style: font.style,
					});
					printWindow.contentDocument!.fonts.add(fontFace);
					fontFace.loaded
						.then(() => {
							markLoaded(fontFace);
						})
						.catch((error: Error) => {
							markLoaded(fontFace, ['Failed loading the font:', fontFace, 'Load error:', error]);
						});
				});
			} else {
				fonts.forEach((font) => markLoaded(font)); // Pretend we loaded the fonts to allow printing to continue
				logMessages({
					messages: [
						'"react-to-print" is not able to load custom fonts because the browser does not support the FontFace API but will continue attempting to print the page',
					],
					suppressErrors,
				});
			}
		}

		const pageStyleToUse = pageStyle ?? DEFAULT_PAGE_STYLE;
		const styleEl = domDoc.createElement('style');

		if (nonce) {
			styleEl.setAttribute('nonce', nonce);
			domDoc.head.setAttribute('nonce', nonce);
		}

		styleEl.appendChild(domDoc.createTextNode(pageStyleToUse));
		domDoc.head.appendChild(styleEl);

		if (bodyClass) {
			domDoc.body.classList.add(...bodyClass.split(' '));
		}

		// Copy canvases
		const targetCanvasEls = domDoc.querySelectorAll('canvas');
		for (let i = 0; i < originalCanvasNodes.length; ++i) {
			// NOTE: must use original data here as the canvass elements in `clonedContentNode` will
			// not have had their painted images copied properly. This is specifically mentioned in
			// the [`cloneNode` docs](https://developer.mozilla.org/en-US/docs/Web/API/Node/cloneNode).
			const sourceCanvas = originalCanvasNodes[i];
			const targetCanvas = targetCanvasEls[i];

			if (targetCanvas === undefined) {
				logMessages({
					messages: [
						'A canvas element could not be copied for printing, has it loaded? `onBeforePrint` likely resolved too early.',
						sourceCanvas,
					],
					suppressErrors,
				});
				continue;
			}

			const targetCanvasContext = targetCanvas.getContext('2d');

			if (targetCanvasContext) {
				targetCanvasContext.drawImage(sourceCanvas, 0, 0);
			}
		}

		// Pre-load images
		for (let i = 0; i < clonedImgNodes.length; i++) {
			const imgNode = clonedImgNodes[i];
			const imgSrc = imgNode.getAttribute('src');

			if (!imgSrc) {
				markLoaded(imgNode, [
					'Found an <img> tag with an empty "src" attribute. This prevents pre-loading it.',
					imgNode,
				]);
			} else {
				// https://stackoverflow.com/questions/10240110/how-do-you-cache-an-image-in-javascript
				const img = new Image();
				img.onload = () => markLoaded(imgNode);
				img.onerror = (_event, _source, _lineno, _colno, error) =>
					markLoaded(imgNode, ['Error loading <img>', imgNode, 'Error', error]);
				img.src = imgSrc;
			}
		}

		// Pre-load videos
		for (let i = 0; i < clonedVideoNodes.length; i++) {
			const videoNode = clonedVideoNodes[i];
			videoNode.preload = 'auto'; // Hint to the browser that it should load this resource

			const videoPoster = videoNode.getAttribute('poster');
			if (videoPoster) {
				// If the video has a poster, pre-load the poster image
				// https://stackoverflow.com/questions/10240110/how-do-you-cache-an-image-in-javascript
				const img = new Image();
				img.onload = () => markLoaded(videoNode);
				img.onerror = (_event, _source, _lineno, _colno, error) =>
					markLoaded(videoNode, [
						'Error loading video poster',
						videoPoster,
						'for video',
						videoNode,
						'Error:',
						error,
					]);
				img.src = videoPoster;
			} else {
				if (videoNode.readyState >= 2) {
					// Check if the video has already loaded a frame
					markLoaded(videoNode);
				} else {
					videoNode.onloadeddata = () => markLoaded(videoNode);

					// TODO: why do `onabort` and `onstalled` seem to fire all the time even if there is no issue?
					// videoNode.onabort = () => markLoaded(videoNode, ["Loading video aborted", videoNode], suppressErrors);
					videoNode.onerror = (_event, _source, _lineno, _colno, error) =>
						markLoaded(videoNode, ['Error loading video', videoNode, 'Error', error]);
					// videoNode.onemptied = () => markLoaded(videoNode, ["Loading video emptied, skipping", videoNode]);
					videoNode.onstalled = () =>
						markLoaded(videoNode, ['Loading video stalled, skipping', videoNode]);
				}
			}
		}

		if (!ignoreGlobalStyles) {
			const styleAndLinkNodes = document.querySelectorAll(
				"style, link[rel~='stylesheet'], link[as='style']"
			);

			for (
				let i = 0, styleAndLinkNodesLen = styleAndLinkNodes.length;
				i < styleAndLinkNodesLen;
				++i
			) {
				const node = styleAndLinkNodes[i];

				if (node.tagName.toLowerCase() === 'style') {
					// <style> nodes
					const newHeadEl = domDoc.createElement(node.tagName);
					const sheet = (node as HTMLStyleElement).sheet as CSSStyleSheet;
					if (sheet) {
						let styleCSS = '';
						// NOTE: for-of is not supported by IE
						try {
							// Accessing `sheet.cssRules` on cross-origin sheets can throw
							// security exceptions in some browsers, notably Firefox
							// https://github.com/MatthewHerbst/react-to-print/issues/429
							const cssLength = sheet.cssRules.length;
							for (let j = 0; j < cssLength; ++j) {
								if (typeof sheet.cssRules[j].cssText === 'string') {
									styleCSS += `${sheet.cssRules[j].cssText}\r\n`;
								}
							}
						} catch (error) {
							logMessages({
								messages: [
									`A stylesheet could not be accessed. This is likely due to the stylesheet having cross-origin imports, and many browsers block script access to cross-origin stylesheets. See https://github.com/MatthewHerbst/react-to-print/issues/429 for details. You may be able to load the sheet by both marking the stylesheet with the cross \`crossorigin\` attribute, and setting the \`Access-Control-Allow-Origin\` header on the server serving the stylesheet. Alternatively, host the stylesheet on your domain to avoid this issue entirely.`, // eslint-disable-line max-len
									node,
									`Original error: ${(error as Error)?.message}`,
								],
								level: 'warning',
							});
						}

						newHeadEl.setAttribute('id', `react-to-print-${i}`);
						if (nonce) {
							newHeadEl.setAttribute('nonce', nonce);
						}
						newHeadEl.appendChild(domDoc.createTextNode(styleCSS));
						domDoc.head.appendChild(newHeadEl);
					}
				} else {
					// <link> nodes, and any others
					// Many browsers will do all sorts of weird things if they encounter an
					// empty `href` tag (which is invalid HTML). Some will attempt to load
					// the current page. Some will attempt to load the page"s parent
					// directory. These problems can cause `react-to-print` to stop without
					// any error being thrown. To avoid such problems we simply do not
					// attempt to load these links.
					if (node.getAttribute('href')) {
						// Browser's don't display `disabled` `link` nodes, so we need to filter them out
						// https://developer.mozilla.org/en-US/docs/Web/HTML/Element/link#attr-disabled
						// https://caniuse.com/mdn-html_elements_link_disabled
						// TODO: ideally we could just filter these out on selection using
						// a selector such as: `link[rel='stylesheet']:not([disabled])`
						// https://stackoverflow.com/questions/27733826/css-selectors-for-excluding-by-attribute-presence
						// However, that doesn't seem to work. Why?
						if (!node.hasAttribute('disabled')) {
							const newHeadEl = domDoc.createElement(node.tagName);

							// Manually re-create the node
							// TODO: document why cloning the node won't work? I don't recall
							// the reasoning behind why we do it this way
							// NOTE: node.attributes has NamedNodeMap type that is not an Array
							// and can be iterated only via direct [i] access
							for (let j = 0, attrLen = node.attributes.length; j < attrLen; ++j) {
								const attr = node.attributes[j];
								if (attr) {
									newHeadEl.setAttribute(attr.nodeName, attr.nodeValue || '');
								}
							}

							newHeadEl.onload = () => markLoaded(newHeadEl);
							newHeadEl.onerror = (_event, _source, _lineno, _colno, error) =>
								markLoaded(newHeadEl, ['Failed to load', newHeadEl, 'Error:', error]);
							if (nonce) {
								newHeadEl.setAttribute('nonce', nonce);
							}
							domDoc.head.appendChild(newHeadEl);
						} else {
							logMessages({
								messages: [
									'`react-to-print` encountered a <link> tag with a `disabled` attribute and will ignore it. Note that the `disabled` attribute is deprecated, and some browsers ignore it. You should stop using it. https://developer.mozilla.org/en-US/docs/Web/HTML/Element/link#attr-disabled. The <link> is:',
									node,
								],
								level: 'warning',
							});
							// `true` because this isn't an error: we are intentionally skipping this node
							markLoaded(node);
						}
					} else {
						logMessages({
							messages: [
								'`react-to-print` encountered a <link> tag with an empty `href` attribute. In addition to being invalid HTML, this can cause problems in many browsers, and so the <link> was not loaded. The <link> is:',
								node,
							],
							level: 'warning',
						});
						// `true` because we"ve already shown a warning for this
						markLoaded(node);
					}
				}
			}
		}
	}

	if (numResourcesToLoad === 0) {
		startPrint(printWindow, options);
	}
}

function appendPrintWindow(
	/** The print iframe */
	printWindow: HTMLIFrameElement,
	markLoaded: (resource: Element | Font | FontFace, errorMessages?: unknown[]) => void,
	data: HandlePrintWindowOnLoadData,
	options: UseReactToPrintOptions
) {
	printWindow.onload = () => handlePrintWindowOnLoad(printWindow, markLoaded, data, options);

	document.body.appendChild(printWindow);
}

function getContentNode({
	contentRef,
	optionalContent,
	suppressErrors,
}: GetContentNodesArgs): ContentNode {
	if (optionalContent) {
		if (contentRef) {
			logMessages({
				level: 'warning',
				messages: [
					'"react-to-print" received a `contentRef` option and a optional-content param passed to its callback. The `contentRef` option will be ignored.',
				],
			});
		}

		// This check allows passing the callback from `useReactToPrint` directly into event
		// handlers without having to wrap it in another function to capture the event
		// See [#742](https://github.com/MatthewHerbst/react-to-print/issues/742) and [#724](https://github.com/MatthewHerbst/react-to-print/issues/724)
		if (typeof optionalContent === 'function') {
			return optionalContent();
		}
	}

	if (contentRef) {
		return contentRef.current;
	}

	logMessages({
		messages: [
			'"react-to-print" did not receive a `contentRef` option or a optional-content param pass to its callback.',
		],
		suppressErrors,
	});
}

function generatePrintWindow(isExternalURL = false): HTMLIFrameElement {
	const printWindow = document.createElement('iframe');
	printWindow.width = `${document.documentElement.clientWidth}px`;
	printWindow.height = `${document.documentElement.clientHeight}px`;
	printWindow.style.position = 'absolute';
	printWindow.style.top = `-${document.documentElement.clientHeight + 100}px`;
	printWindow.style.left = `-${document.documentElement.clientWidth + 100}px`;
	printWindow.id = 'printWindow';
	// Set `srcdoc` only if not loading an external URL
	if (!isExternalURL) {
		printWindow.srcdoc = '<!DOCTYPE html>';
	}

	return printWindow;
}

export function useReactToPrint(options: UseReactToPrintOptions): UseReactToPrintFn {
	const {
		contentRef,
		fonts,
		ignoreGlobalStyles,
		onBeforePrint,
		onPrintError,
		preserveAfterPrint,
		suppressErrors,
	} = options;

	const handlePrint = useCallback(
		(optionalContent?: UseReactToPrintHookContent) => {
			const { externalURL } = options;

			// Ensure we remove any pre-existing print windows before adding a new one
			removePrintIframe(preserveAfterPrint, true);

			const proceedToPrint = () => {
				if (externalURL) {
					// Handle external URL case
					const printWindow = generatePrintWindow(true); // Pass `true` to indicate external URL
					printWindow.src = externalURL;

					// Set up onload handler to start printing once the content is loaded
					printWindow.onload = () => {
						try {
							startPrint(printWindow, options, true); // Pass `true` to indicate external URL
						} catch (error) {
							onPrintError?.('startPrint', error);
						}
					};

					document.body.appendChild(printWindow);
				} else {
					// Existing contentRef handling code
					// ... (rest of your existing handlePrint logic)

					// Ensure we append the print window and start the print process
					const contentNode = getContentNode({
						contentRef,
						optionalContent,
						suppressErrors,
					});

					if (!contentNode) {
						logMessages({
							messages: ['There is nothing to print'],
							suppressErrors,
						});
						return;
					}

					// NOTE: `canvas` elements do not have their painted images copied
					// https://developer.mozilla.org/en-US/docs/Web/API/Node/cloneNode
					const clonedContentNode = contentNode.cloneNode(true);

					const globalLinkNodes = document.querySelectorAll(
						"link[rel~='stylesheet'], link[as='style']"
					);
					const clonedImgNodes = (clonedContentNode as Element).querySelectorAll('img');
					const clonedVideoNodes = (clonedContentNode as Element).querySelectorAll('video');

					const numFonts = fonts ? fonts.length : 0;

					const numResourcesToLoad =
						(ignoreGlobalStyles ? 0 : globalLinkNodes.length) +
						clonedImgNodes.length +
						clonedVideoNodes.length +
						numFonts;
					const resourcesLoaded: (Element | Font | FontFace)[] = [];
					const resourcesErrored: (Element | Font | FontFace)[] = [];

					const printWindow = generatePrintWindow();

					const markLoaded = (resource: Element | Font | FontFace, errorMessages?: unknown[]) => {
						if (resourcesLoaded.includes(resource)) {
							logMessages({
								level: 'debug',
								messages: ['Tried to mark a resource that has already been handled', resource],
								suppressErrors,
							});
							return;
						}

						if (!errorMessages) {
							resourcesLoaded.push(resource);
						} else {
							logMessages({
								messages: [
									'"react-to-print" was unable to load a resource but will continue attempting to print the page',
									...errorMessages,
								],
								suppressErrors,
							});
							resourcesErrored.push(resource);
						}

						const numResourcesManaged = resourcesLoaded.length + resourcesErrored.length;

						if (numResourcesManaged === numResourcesToLoad) {
							startPrint(printWindow, options);
						}
					};

					const data: HandlePrintWindowOnLoadData = {
						contentNode,
						clonedContentNode,
						clonedImgNodes,
						clonedVideoNodes,
						numResourcesToLoad,
						originalCanvasNodes: (contentNode as Element).querySelectorAll('canvas'),
					};

					// Append the print window and start the print process
					appendPrintWindow(printWindow, markLoaded, data, options);
				}
			};

			if (onBeforePrint) {
				onBeforePrint()
					.then(() => proceedToPrint())
					.catch((error: Error) => {
						onPrintError?.('onBeforePrint', error);
					});
			} else {
				proceedToPrint();
			}
		},
		[options]
	);

	return handlePrint;
}
