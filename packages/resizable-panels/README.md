# @wcpos/resizable-panels

Resizable panel groups for React Native (web, Electron, iOS, Android), built on `react-native-reanimated` and `react-native-gesture-handler`.

Vendored from [wcpos/react-native-resizable-panels](https://github.com/wcpos/react-native-resizable-panels), itself a port of Brian Vaughn's [react-resizable-panels](https://github.com/bvaughn/react-resizable-panels). The web-DOM helpers, `autoSaveId`, and other unreachable code from the original were dropped in the move.

Exports: `PanelGroup`, `Panel`, `PanelResizeHandle`, `usePanelGroupContext` and their prop/handle types.

## Size units

Panel sizes accept percentages as numbers, unitless strings, or `%` strings. Use `px` strings for fixed sizes along the group axis; other CSS units are not supported.

## Ordering

Panels and resize handles follow an explicit `order` when provided. Otherwise web and Fabric hosts use measured position, falling back to registration order when measurement is unavailable.
