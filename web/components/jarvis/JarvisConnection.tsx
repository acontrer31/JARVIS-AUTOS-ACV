// Una línea de conexión entre el núcleo (centro) y un nodo. Es un elemento SVG
// pensado para vivir dentro del <svg> de JarvisNetwork (viewBox 0 0 100 100,
// centro en 50,50). Brilla cuando su nodo está activo o resaltado por hover.
export default function JarvisConnection({
  x,
  y,
  fuerte,
}: {
  x: number;
  y: number;
  fuerte: boolean;
}) {
  return (
    <line
      x1={50}
      y1={50}
      x2={x}
      y2={y}
      stroke="var(--dorado)"
      strokeWidth={fuerte ? 1.6 : 0.8}
      strokeOpacity={fuerte ? 0.85 : 0.22}
      strokeDasharray="2 3"
      vectorEffect="non-scaling-stroke"
      style={{ transition: "stroke-opacity 0.3s ease, stroke-width 0.3s ease" }}
    />
  );
}
