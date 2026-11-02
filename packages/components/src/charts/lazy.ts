// One dynamic root prevents Metro hoisting libraries shared by the two charts.
export const loadCharts = () => import('./charts-impl');
export type { CartesianActionsHandle, ChartBounds, PointsArray } from './charts-impl';
