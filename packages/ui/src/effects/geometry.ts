export const TAU = Math.PI * 2;
export type Position = readonly [number, number];

/** Low detail geographical masks, drawn here rather than copied from the reference. */
const continents: readonly (readonly Position[])[] = [
  [[-17, 35], [-5, 37], [10, 37], [23, 32], [33, 31], [43, 12], [51, 11], [41, -5], [34, -21], [21, -35], [13, -28], [11, -16], [1, -2], [-8, 5], [-17, 15]],
  [[-11, 36], [-9, 44], [-2, 44], [-4, 49], [8, 54], [9, 60], [19, 71], [29, 70], [27, 59], [40, 58], [41, 46], [28, 41], [21, 36], [15, 43], [9, 44], [3, 41]],
  [[26, 70], [52, 73], [76, 72], [105, 77], [137, 72], [173, 63], [169, 53], [143, 47], [134, 34], [123, 30], [116, 19], [105, 9], [99, 17], [92, 22], [81, 8], [72, 21], [58, 27], [49, 12], [42, 15], [35, 31], [42, 42], [30, 47]],
  [[-167, 66], [-138, 70], [-126, 60], [-112, 70], [-92, 74], [-61, 58], [-55, 49], [-69, 45], [-81, 25], [-89, 21], [-78, 8], [-84, 9], [-100, 24], [-116, 31], [-125, 49], [-147, 58]],
  [[-81, 11], [-68, 11], [-50, 1], [-35, -8], [-43, -24], [-53, -34], [-65, -55], [-73, -48], [-73, -22], [-81, -5]],
  [[112, -11], [131, -12], [142, -10], [153, -25], [145, -40], [130, -33], [115, -35]],
  [[-52, 59], [-44, 60], [-20, 76], [-29, 83], [-51, 81], [-62, 69]],
  [[47, -13], [50, -17], [46, -26], [43, -24]],
  [[-8, 50], [-2, 51], [0, 58], [-5, 59]],
  [[130, 32], [141, 40], [145, 45], [141, 35]],
];

function inside(x: number, y: number, polygon: readonly Position[]) {
  let result = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index];
    const b = polygon[previous];
    if (!a || !b) continue;
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
  }
  return result;
}

export const isLand = (longitude: number, latitude: number) => continents.some((polygon) => inside(longitude, latitude, polygon));

export function random(seed: number) {
  let current = seed;
  return () => {
    current = (Math.imul(current, 1664525) + 1013904223) >>> 0;
    return current / 4294967296;
  };
}

export function glow(context: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, intensity = 1) {
  const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, `rgba(${color},${intensity})`);
  gradient.addColorStop(0.18, `rgba(${color},${intensity * 0.45})`);
  gradient.addColorStop(1, `rgba(${color},0)`);
  context.fillStyle = gradient;
  context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

export function point(context: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string) {
  context.beginPath();
  context.arc(x, y, radius, 0, TAU);
  context.fillStyle = color;
  context.fill();
}
