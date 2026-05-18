export const LIFE_COST_TIERS = [
  { min: 0, max: 20, cost: 35 },
  { min: 20, max: 30, cost: 50 },
  { min: 30, max: 40, cost: 60 },
  { min: 40, max: 50, cost: 75 },
  { min: 50, max: 60, cost: 90 },
  { min: 60, max: 70, cost: 110 },
  { min: 70, max: 80, cost: 135 },
  { min: 80, max: 90, cost: 160 },
  { min: 90, max: 101, cost: 190 },
];

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const getLifeCostPerPercent = (level: number) => {
  const clamped = clamp(Math.floor(level), 0, 100);
  const tier = LIFE_COST_TIERS.find(
    (item) => clamped >= item.min && clamped < item.max
  );
  return tier ? tier.cost : LIFE_COST_TIERS[LIFE_COST_TIERS.length - 1].cost;
};

export const calcLifeUpgradeCostRange = (fromLevel: number, toLevel: number) => {
  const from = clamp(Math.floor(fromLevel), 0, 100);
  const to = clamp(Math.floor(toLevel), 0, 100);
  if (to <= from) return 0;
  let cost = 0;
  for (let level = from; level < to; level += 1) {
    cost += getLifeCostPerPercent(level);
  }
  return cost;
};
