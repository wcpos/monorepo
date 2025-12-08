# Drag and Drop Components

Cross-platform drag-and-drop components with a unified API for web and React Native.

## Installation

The package uses platform-specific implementations:
- **Web**: Uses `@atlaskit/pragmatic-drag-and-drop`
- **React Native**: Uses `react-native-gesture-handler` and `react-native-reanimated` v4

## Usage

### Basic Sortable List

```tsx
import { SortableList } from '@wcpos/components/dnd';

function MyList() {
  const [items, setItems] = useState([
    { id: '1', name: 'Item 1' },
    { id: '2', name: 'Item 2' },
    { id: '3', name: 'Item 3' },
  ]);

  return (
    <SortableList
      listId="my-list"
      items={items}
      getItemId={(item) => item.id}
      onOrderChange={({ items }) => setItems(items)}
      renderItem={(item) => (
        <View style={styles.item}>
          <Text>{item.name}</Text>
        </View>
      )}
    />
  );
}
```

### Props

#### SortableListProps

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `listId` | `string` | required | Unique identifier for the list (important for nested lists) |
| `items` | `T[]` | required | Array of items to render |
| `getItemId` | `(item: T) => string \| number` | required | Function to get unique ID from item |
| `renderItem` | `(item: T, index: number) => ReactNode` | required | Render function for each item |
| `onOrderChange` | `(result: ReorderResult<T>) => void` | - | Called when order changes |
| `gap` | `number` | `8` | Gap between items in pixels |
| `axis` | `'vertical' \| 'horizontal'` | `'vertical'` | Direction of the list |
| `className` | `string` | - | (Web only) CSS class name |
| `style` | `ViewStyle` | - | (Native only) Style object |

#### ReorderResult

```typescript
interface ReorderResult<T> {
  items: T[];      // New array of items in their new order
  fromIndex: number; // Original index of dragged item
  toIndex: number;   // New index of dragged item
  itemId: ItemId;    // ID of the dragged item
}
```

## Nested Lists

The `listId` prop is crucial for nested lists. Each list must have a unique ID so that items can only be reordered within their own list:

```tsx
function ParentList() {
  return (
    <SortableList
      listId="parent"
      items={parentItems}
      getItemId={(item) => item.id}
      onOrderChange={handleParentChange}
      renderItem={(parentItem) => (
        <View>
          <Text>{parentItem.name}</Text>
          <SortableList
            listId={`child-${parentItem.id}`}
            items={parentItem.children}
            getItemId={(child) => child.id}
            onOrderChange={(result) => handleChildChange(parentItem.id, result)}
            renderItem={(child) => <Text>{child.name}</Text>}
          />
        </View>
      )}
    />
  );
}
```

## Platform-Specific Notes

### Web
- Uses `@atlaskit/pragmatic-drag-and-drop` for native HTML5 drag-and-drop
- Supports custom drag previews via `renderPreview` prop on `SortableItem`
- Flash animation on drop via `showFlash` prop

### React Native
- Uses `react-native-gesture-handler` for gesture detection
- Uses `react-native-reanimated` v4 for 60fps animations
- Haptic feedback on drag start (via `expo-haptics`)
- Ensure your app has `GestureHandlerRootView` at the root, or use `SortableListWithGestureHandler`

## Migration from Legacy API

The old `@mgcrea/react-native-dnd` based API is still exported for backward compatibility but will be removed in a future version. Migrate to the new `SortableList` API:

```tsx
// Old API (deprecated)
<DndProvider>
  <DraggableStack onOrderChange={...}>
    <Draggable id="1">...</Draggable>
    <Draggable id="2">...</Draggable>
  </DraggableStack>
</DndProvider>

// New API
<SortableList
  listId="my-list"
  items={items}
  getItemId={(item) => item.id}
  onOrderChange={...}
  renderItem={(item) => ...}
/>
```
