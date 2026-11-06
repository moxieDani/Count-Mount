/** SVG 부채꼴: 각 계정의 보이는 영역만 포인터 이벤트를 받는다. */
export function pieSlicePath(offset: number, size: number): string {
 const point = (percent: number) => {
  const angle = percent * Math.PI * 2 / 100 - Math.PI / 2;
  const round = (value: number) => Math.round(value * 10000) / 10000;
  return `${round(21 + 20 * Math.cos(angle))} ${round(21 + 20 * Math.sin(angle))}`;
 };
 const start = point(offset);
 if (size >= 100) return `M 21 21 L ${start} A 20 20 0 0 1 ${point(offset + 50)} A 20 20 0 0 1 ${start} Z`;
 return `M 21 21 L ${start} A 20 20 0 ${size > 50 ? 1 : 0} 1 ${point(offset + size)} Z`;
}
