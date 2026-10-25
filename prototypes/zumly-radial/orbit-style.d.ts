// La rama de Orbit trae tipos para el runtime, pero no para su CSS: TypeScript 6
// rechaza el import de solo efectos de '@zumer/orbit/style' sin esto.
declare module '@zumer/orbit/style';
