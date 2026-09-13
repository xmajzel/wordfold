export type CardStackMotion = {
  index: number;
  x: number;
  y: number;
  opacity: number;
  width: number;
  height: number;
};

export function restingCardMotion(index: number, width = 0, height = 0): CardStackMotion {
  'worklet';
  return { index, x: 0, y: 0, opacity: 1, width, height };
}

export function getCardLayerStyle(index: number, motion: CardStackMotion, reduceMotion = false) {
  'worklet';
  const active = index === motion.index;
  const previous = index === motion.index - 1 && motion.y > 0;
  const next = index === motion.index + 1;
  const travel = motion.height + 100;
  return {
    zIndex: previous ? 3 : active ? 2 : next ? 1 : 0,
    opacity: active ? motion.opacity : previous || next ? 1 : 0,
    transform: [
      { translateX: active ? motion.x : 0 },
      { translateY: previous ? Math.min(motion.y, travel) - travel : active ? Math.min(motion.y, 0) : 0 },
      { rotate: `${active && !reduceMotion ? Math.max(-5, Math.min(5, motion.x / Math.max(motion.width, 280) * 5)) : 0}deg` },
    ],
  };
}
