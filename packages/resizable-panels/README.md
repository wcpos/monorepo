# react-native-resizable-panels

Resizable panel groups for React Native — the same one-source layout on **iOS, Android, web and Electron**. Built on `react-native-reanimated` and `react-native-gesture-handler`; a cross-platform port of Brian Vaughn's [react-resizable-panels](https://github.com/bvaughn/react-resizable-panels), whose layout math this library shares.

```tsx
import { Panel, PanelGroup, PanelResizeHandle } from 'react-native-resizable-panels';

<PanelGroup direction="horizontal">
  <Panel defaultSize={60} minSize={25}>
    <Products />
  </Panel>
  <PanelResizeHandle style={{ width: 8, backgroundColor: '#ddd' }} />
  <Panel defaultSize={40} minSize="320px">
    <Cart />
  </Panel>
</PanelGroup>
```

## Installation

```sh
npm install react-native-resizable-panels react-native-reanimated react-native-gesture-handler react-native-worklets
```

Peer dependencies: `react >= 19`, `react-native-reanimated >= 4`, `react-native-gesture-handler >= 2.24`, `react-native-worklets >= 0.5`. Follow the Reanimated and Gesture Handler setup guides (Babel plugin, `GestureHandlerRootView`). `react-native` and `react-native-web` are optional peers — web builds only need `react-native-web`.

## Sizes

Panel sizes are **percentages of the group by default** — as numbers (`defaultSize={40}`), unitless strings (`"40"`) or `%` strings (`"40%"`). For fixed sizes use `px` strings (`minSize="320px"`); they are resolved against the group's measured size, so they keep working when the window or device rotates. Other CSS units are not supported.

> Give every panel a `defaultSize` that adds up to 100. Before the first layout lands, panels render with `flexGrow = defaultSize ?? 1`; a sized panel next to an unsized one briefly renders 60:1 instead of 60:40.

## API

### `PanelGroup`

| Prop | Type | Description |
| --- | --- | --- |
| `direction` | `"horizontal" \| "vertical"` | **Required.** Axis the panels are laid out along. |
| `disabled` | `boolean` | Disables every resize handle in the group. |
| `onLayoutChanged` | `(layout: number[], { isUserInteraction }) => void` | Called **once** after a layout change settles: on pointer-up for drags (`isUserInteraction: true`); immediately for imperative, mount and resize-driven changes (`false`). Use this to persist layouts. |
| `onLayout` | `(layout: number[]) => void` | Called on **every** change, including each drag frame. Prefer `onLayoutChanged`. |
| `style` | `ViewStyle` | Style for the root `View`. Other `View` props are forwarded. |
| `ref` | `ImperativePanelGroupHandle` | `getId()`, `getLayout(): number[]`, `setLayout(layout: number[])`. |

### `Panel`

| Prop | Type | Description |
| --- | --- | --- |
| `defaultSize` | `number \| string` | Initial size. Auto-assigned from the remaining space when omitted. |
| `minSize` | `number \| string` | Minimum size (default `0`). |
| `maxSize` | `number \| string` | Maximum size (default `100`). |
| `collapsible` | `boolean` | Collapse to `collapsedSize` when dragged below `minSize`. |
| `collapsedSize` | `number \| string` | Size when collapsed (default `0`). |
| `disabled` | `boolean` | The panel keeps its size during pointer and keyboard resizes, directly or indirectly. The imperative API can still resize it. |
| `groupResizeBehavior` | `"preserve-relative-size" \| "preserve-pixel-size"` | What happens when the *group* resizes (rotation, window resize). Default keeps the percentage; `preserve-pixel-size` keeps the pixel width and lets the other panels absorb the change. At least one panel must stay relative. |
| `id` | `string` | Stable id; recommended for conditionally rendered panels. |
| `order` | `number` | Explicit position. See [Ordering](#ordering). |
| `onResize` | `(size: number, prevSize?: number) => void` | Size in percent. |
| `onCollapse` / `onExpand` | `() => void` | Collapse-state transitions. |
| `style` | `ViewStyle` | Merged over the panel's own flex styles. Other `View` props are forwarded. |
| `ref` | `ImperativePanelHandle` | `collapse()`, `expand(minSize?)`, `resize(size)`, `getSize()`, `getId()`, `isCollapsed()`, `isExpanded()`. |

### `PanelResizeHandle`

An unstyled `View` between two panels. Give it a size and colour via `style`, or put your own grip in `children`.

| Prop | Type | Description |
| --- | --- | --- |
| `disabled` | `boolean` | Ignores gestures. |
| `hitTargetSize` | `number` | Minimum touch/click target along the axis, padded with gesture hit-slop. Defaults to 37px on touch, 27px with a mouse. `0` disables. |
| `disableDoubleTap` | `boolean` | Double-tap (double-click on web) resets the panel before the handle to its `defaultSize`; this turns that off. |
| `onDragging` | `(isDragging: boolean) => void` | Drag start/end. |
| `order` | `number` | Explicit position, like `Panel.order`. |
| `style`, `children`, `testID`, … | | Forwarded to the `View`. |

### `usePanelGroupContext()`

Returns `{ direction, groupId }` for custom handle components.

## Ordering

Panels and handles are ordered by their **measured position** on screen, so conditionally rendered panels just work:

```tsx
<PanelGroup direction="horizontal">
  {showSidebar && (
    <>
      <Panel id="sidebar" minSize={20}><Sidebar /></Panel>
      <PanelResizeHandle />
    </>
  )}
  <Panel id="main" minSize={25}><Main /></Panel>
</PanelGroup>
```

If any panel or handle carries an explicit `order`, ordering follows `order` instead (registration order breaks ties).

## Keyboard & accessibility (web)

On web each handle is a focusable `role="separator"` with `aria-valuemin/max/now`. Arrow keys resize by 5 %, Home/End go to the limits, Enter toggles a collapsible neighbour.

## FAQ

**Why don't I see a handle?** It's an empty `View` by default. Style it: `<PanelResizeHandle style={{ width: 4, backgroundColor: '#888' }} />`.

**Can layouts be persisted?** Save the array from `onLayoutChanged` (only when `isUserInteraction` is true, if you want to ignore programmatic changes) and feed it back through each panel's `defaultSize`.

**Does resizing run on the UI thread?** Gestures are captured by Gesture Handler on the UI thread; the layout math runs on the JS thread and writes Reanimated shared values that drive the panel styles.

## Credits & licence

Layout algorithm and API design by [Brian Vaughn](https://github.com/bvaughn) (`react-resizable-panels`). MIT — see [LICENSE](./LICENSE). Source: [`wcpos/monorepo/packages/resizable-panels`](https://github.com/wcpos/monorepo/tree/main/packages/resizable-panels).

## Releasing (maintainers)

Bump `version` in a pull request, merge, then run the **Release react-native-resizable-panels** workflow and pick the npm tag (`latest`, `beta`, `next`). Publishing uses npm Trusted Publishing (GitHub OIDC) — there is no token to rotate.
