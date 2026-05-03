import { useCallback, useEffect, useRef, useState } from 'react';

import { closeBrackets } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { html } from '@codemirror/lang-html';
import { php } from '@codemirror/lang-php';
import { bracketMatching, defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { EditorState } from '@codemirror/state';
import {
	EditorView,
	highlightActiveLine,
	highlightActiveLineGutter,
	keymap,
	lineNumbers,
} from '@codemirror/view';

import { mustacheOverlay } from '../codemirror/mustache-language';
import { wordpressTheme } from '../codemirror/theme';

import type { TemplateEngine } from '../studio-core';

interface CodePanelProps {
	content: string | undefined;
	engine?: TemplateEngine;
	templateName?: string;
}

const HEIGHT_STORAGE_KEY = 'wcpos-template-studio:code-panel-height';
const COLLAPSED_STORAGE_KEY = 'wcpos-template-studio:code-panel-collapsed';
const DEFAULT_HEIGHT = 320;
const MIN_HEIGHT = 140;
const MAX_HEIGHT_RATIO = 0.85;
const SNAP_THRESHOLD = 90;
const HEADER_HEIGHT = 32;

function loadNumber(key: string, fallback: number): number {
	if (typeof window === 'undefined') return fallback;
	try {
		const raw = window.localStorage.getItem(key);
		if (raw == null) return fallback;
		const n = Number(raw);
		return Number.isFinite(n) && n > 0 ? n : fallback;
	} catch {
		return fallback;
	}
}

function loadBool(key: string, fallback: boolean): boolean {
	if (typeof window === 'undefined') return fallback;
	try {
		const raw = window.localStorage.getItem(key);
		if (raw == null) return fallback;
		return raw === 'true';
	} catch {
		return fallback;
	}
}

function languageExtensionsFor(engine: TemplateEngine | undefined) {
	// Studio templates currently come in `logicless` and `thermal` flavours,
	// both of which are HTML + mustache. The `legacy-php` branch matches the
	// editor's behaviour and lets us extend later without restructuring.
	if ((engine as string) === 'legacy-php') return [php()];
	return [html(), mustacheOverlay];
}

export function CodePanel({ content, engine, templateName }: CodePanelProps) {
	const [height, setHeight] = useState(() => loadNumber(HEIGHT_STORAGE_KEY, DEFAULT_HEIGHT));
	const [collapsed, setCollapsed] = useState(() => loadBool(COLLAPSED_STORAGE_KEY, false));
	const dragStateRef = useRef<{
		startY: number;
		startHeight: number;
		stageHeight: number;
	} | null>(null);
	const rootRef = useRef<HTMLDivElement | null>(null);
	const editorContainerRef = useRef<HTMLDivElement | null>(null);
	const viewRef = useRef<EditorView | null>(null);

	useEffect(() => {
		if (typeof window === 'undefined') return;
		try {
			window.localStorage.setItem(HEIGHT_STORAGE_KEY, String(height));
		} catch {
			/* storage may be disabled */
		}
	}, [height]);

	useEffect(() => {
		if (typeof window === 'undefined') return;
		try {
			window.localStorage.setItem(COLLAPSED_STORAGE_KEY, String(collapsed));
		} catch {
			/* storage may be disabled */
		}
	}, [collapsed]);

	// Mount/dispose the editor when the host node appears or the engine changes.
	useEffect(() => {
		if (collapsed) return;
		const host = editorContainerRef.current;
		if (!host) return;

		const state = EditorState.create({
			doc: content ?? '',
			extensions: [
				lineNumbers(),
				highlightActiveLine(),
				highlightActiveLineGutter(),
				history(),
				bracketMatching(),
				closeBrackets(),
				highlightSelectionMatches(),
				syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
				keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
				...languageExtensionsFor(engine),
				wordpressTheme,
				EditorView.lineWrapping,
				EditorState.readOnly.of(true),
				EditorView.editable.of(false),
			],
		});

		const view = new EditorView({ state, parent: host });
		viewRef.current = view;

		return () => {
			view.destroy();
			viewRef.current = null;
		};
	}, [engine, collapsed]);

	// Sync content into the existing view when only the document changes.
	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;
		const next = content ?? '';
		const current = view.state.doc.toString();
		if (next === current) return;
		view.dispatch({
			changes: { from: 0, to: view.state.doc.length, insert: next },
		});
	}, [content]);

	const handlePointerDown = useCallback(
		(event: React.PointerEvent<HTMLDivElement>) => {
			event.preventDefault();
			(event.target as Element).setPointerCapture(event.pointerId);
			const stageEl = rootRef.current?.parentElement;
			const stageHeight = stageEl ? stageEl.getBoundingClientRect().height : window.innerHeight;
			dragStateRef.current = {
				startY: event.clientY,
				startHeight: collapsed ? HEADER_HEIGHT : height,
				stageHeight,
			};
		},
		[collapsed, height]
	);

	const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
		const drag = dragStateRef.current;
		if (!drag) return;
		const delta = drag.startY - event.clientY;
		const next = drag.startHeight + delta;
		if (next < SNAP_THRESHOLD) {
			setCollapsed(true);
			return;
		}
		const cap = Math.max(MIN_HEIGHT, drag.stageHeight * MAX_HEIGHT_RATIO);
		setCollapsed(false);
		setHeight(Math.min(cap, Math.max(MIN_HEIGHT, next)));
	}, []);

	const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
		if (!dragStateRef.current) return;
		dragStateRef.current = null;
		try {
			(event.target as Element).releasePointerCapture(event.pointerId);
		} catch {
			/* pointer may already be released */
		}
	}, []);

	const effectiveHeight = collapsed ? HEADER_HEIGHT : height;
	const engineLabel = engine === 'thermal' ? 'thermal' : engine === 'logicless' ? 'logicless' : '';

	return (
		<div
			ref={rootRef}
			className={`code-panel${collapsed ? 'collapsed' : ''}`}
			style={{ height: effectiveHeight }}
			aria-label="Template source"
		>
			<div
				className="code-panel-resizer"
				role="separator"
				aria-orientation="horizontal"
				aria-label="Resize template source panel"
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerUp}
				onPointerCancel={handlePointerUp}
			/>
			<button
				type="button"
				className="code-panel-header"
				onClick={() => setCollapsed((current) => !current)}
				aria-expanded={!collapsed}
				aria-controls="code-panel-body"
			>
				<span className="code-panel-title">Source</span>
				{templateName ? <span className="code-panel-name">{templateName}</span> : null}
				{engineLabel ? <span className="code-panel-tag">{engineLabel}</span> : null}
				<span className="code-panel-spacer" />
				<span className="code-panel-chevron" aria-hidden="true">
					{collapsed ? '▴' : '▾'}
				</span>
			</button>
			{!collapsed ? (
				<div id="code-panel-body" className="code-panel-body" ref={editorContainerRef} />
			) : null}
		</div>
	);
}
