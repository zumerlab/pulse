// Points and arcs on a circle, for the primitives drawn as SVG (the time
// window, the orbit's hub). Angles in degrees, 0 at the top, clockwise.
// Internal to the core: not exported by the package.

export const polar = (a: number, r: number) => { const t = a * Math.PI / 180; return [r * Math.sin(t), -r * Math.cos(t)]; };
export const arcPath = (a0: number, a1: number, r: number) => {
  const [x0, y0] = polar(a0, r), [x1, y1] = polar(a1, r);
  return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
};
