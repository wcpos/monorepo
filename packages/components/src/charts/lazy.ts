// One dynamic root prevents Metro hoisting libraries shared by the two charts.
export const loadCharts = () => import('./charts-impl');
