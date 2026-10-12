'use client';

const WALL_SCENES = [
  { name: 'elevator', image: '/mockups/walls/elevator.jpg' },
  { name: 'warm-wall', image: '/mockups/walls/warm-wall.jpg' },
  { name: 'concrete-wall', image: '/mockups/walls/concrete-wall.jpg' },
];

function sceneFor(product) {
  const id = Number(product?.id);
  return WALL_SCENES[(Number.isFinite(id) ? Math.abs(id) : 0) % WALL_SCENES.length];
}

/** A frame-free room preview made from the supplied room photos and exact print artwork. */
export function PosterMockup({ product, className = '' }) {
  const image = product.image || `/posters/${product.id}.png`;
  const scene = sceneFor(product);

  return (
    <span className={`poster-mockup poster-mockup--${scene.name} ${className}`.trim()} aria-hidden="true">
      <img className="poster-mockup-wall" src={scene.image} alt="" />
      <span className="poster-mockup-art-wrap">
        <img className="poster-mockup-art" src={image} alt="" />
      </span>
    </span>
  );
}
