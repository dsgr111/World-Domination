import { motion } from "motion/react";

// Simplified SVG world map paths for key countries in the game
// Each country has an approximate SVG path scaled to a 1000x500 viewBox
const COUNTRY_PATHS: Record<string, string> = {
  ru: "M520,80 L620,75 L680,85 L720,80 L750,90 L760,110 L740,130 L700,140 L660,135 L620,145 L580,140 L540,130 L510,115 Z M620,75 L650,60 L700,55 L720,65 L710,78 L680,85 Z",
  cn: "M640,155 L700,145 L740,155 L745,175 L730,195 L710,205 L680,200 L650,185 L635,170 Z",
  jp: "M755,155 L765,145 L775,155 L770,170 L758,165 Z M760,175 L770,168 L778,178 L772,190 L762,185 Z",
  in: "M640,195 L680,190 L700,205 L695,235 L680,250 L660,245 L645,230 L640,210 Z",
  sa: "M570,200 L610,195 L625,205 L620,225 L600,235 L575,225 L565,215 Z",
  tr: "M530,165 L575,160 L585,170 L580,183 L550,185 L530,178 Z",
  us: "M130,140 L230,130 L270,145 L265,175 L230,185 L170,182 L125,170 Z",
  ca: "M120,80 L260,70 L280,100 L270,130 L230,130 L120,120 Z",
  mx: "M140,190 L200,185 L215,200 L210,215 L185,220 L150,210 Z",
  br: "M250,250 L320,240 L340,260 L335,300 L310,315 L275,310 L250,290 Z",
  de: "M480,125 L510,120 L520,133 L515,148 L490,150 L475,140 Z",
  fr: "M450,140 L485,133 L490,150 L480,165 L455,163 L440,152 Z",
  gb: "M430,115 L450,110 L455,125 L445,135 L428,130 Z",
  it: "M490,155 L515,150 L520,168 L510,185 L495,183 L485,170 Z",
  es: "M430,158 L468,153 L473,168 L460,178 L433,175 Z",
  pl: "M505,118 L535,113 L540,128 L528,138 L505,135 Z",
  ua: "M530,125 L570,120 L577,135 L565,147 L530,145 Z",
  au: "M700,290 L780,280 L800,305 L790,335 L750,345 L710,335 L695,315 Z",
  kr: "M738,158 L753,153 L758,165 L748,173 L735,168 Z",
  kp: "M735,145 L750,140 L755,153 L743,160 L733,155 Z",
};

const COUNTRY_LABELS: Record<string, { x: number; y: number }> = {
  ru: { x: 630, y: 110 },
  cn: { x: 690, y: 175 },
  jp: { x: 770, y: 165 },
  in: { x: 670, y: 225 },
  sa: { x: 592, y: 215 },
  tr: { x: 555, y: 173 },
  us: { x: 190, y: 160 },
  ca: { x: 195, y: 100 },
  mx: { x: 175, y: 205 },
  br: { x: 292, y: 278 },
  de: { x: 495, y: 135 },
  fr: { x: 462, y: 152 },
  gb: { x: 438, y: 122 },
  it: { x: 500, y: 168 },
  es: { x: 450, y: 166 },
  pl: { x: 518, y: 127 },
  ua: { x: 548, y: 133 },
  au: { x: 745, y: 313 },
  kr: { x: 745, y: 163 },
  kp: { x: 743, y: 150 },
};

interface AttackAnim {
  id: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  color: string;
}

interface WorldMapProps {
  gameCountries: {
    id: string;
    name: string;
    flag: string;
    color?: string;
    eliminated?: boolean;
    isMe?: boolean;
  }[];
  attacks?: AttackAnim[];
  onCountryClick?: (id: string) => void;
}

// Map country positions for attacks
const getCountryCenter = (id: string) => {
  return COUNTRY_LABELS[id] || { x: 500, y: 250 };
};

export const buildAttackAnims = (
  impacts: { attackerCountryId: string | null; targetCountryId: string }[],
  countryColors: Record<string, string>
): AttackAnim[] =>
  impacts
    .filter((i) => i.attackerCountryId)
    .map((i) => {
      const from = getCountryCenter(i.attackerCountryId!);
      const to = getCountryCenter(i.targetCountryId);
      return {
        id: `${i.attackerCountryId}-${i.targetCountryId}-${Math.random()}`,
        fromX: from.x,
        fromY: from.y,
        toX: to.x,
        toY: to.y,
        color: countryColors[i.attackerCountryId!] || "#ef4444",
      };
    });

const TEAM_COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#ef4444",
  "#3b82f6", "#ec4899", "#8b5cf6", "#14b8a6",
  "#f97316", "#a3e635", "#06b6d4", "#e11d48",
];

export default function WorldMap({ gameCountries, attacks = [], onCountryClick }: WorldMapProps) {
  const colorMap: Record<string, string> = {};
  gameCountries.forEach((c, i) => {
    colorMap[c.id] = c.color || TEAM_COLORS[i % TEAM_COLORS.length];
  });

  const gameIds = new Set(gameCountries.map((c) => c.id));

  return (
    <div
      className="w-full rounded-[16px] overflow-hidden relative"
      style={{
        background: "linear-gradient(160deg, rgba(10,15,30,0.95), rgba(20,30,60,0.95))",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <svg
        viewBox="0 0 1000 500"
        className="w-full h-auto"
        style={{ maxHeight: 320 }}
      >
        {/* Ocean background */}
        <rect width="1000" height="500" fill="rgba(15,25,50,0.6)" />

        {/* Grid lines */}
        {[0, 100, 200, 300, 400].map((y) => (
          <line key={y} x1="0" y1={y + 60} x2="1000" y2={y + 60}
            stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
        ))}
        {[0, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((x) => (
          <line key={x} x1={x} y1="0" x2={x} y2="500"
            stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
        ))}

        {/* All countries (non-game) */}
        {Object.entries(COUNTRY_PATHS).map(([id, d]) => {
          if (gameIds.has(id)) return null;
          return (
            <path key={id} d={d}
              fill="rgba(255,255,255,0.05)"
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="0.8"
            />
          );
        })}

        {/* Game countries */}
        {gameCountries.map((country) => {
          const d = COUNTRY_PATHS[country.id];
          if (!d) return null;
          const color = colorMap[country.id];
          const eliminated = country.eliminated;
          const label = COUNTRY_LABELS[country.id];
          return (
            <g key={country.id}>
              <motion.path
                d={d}
                fill={eliminated ? "rgba(239,68,68,0.2)" : `${color}55`}
                stroke={eliminated ? "#ef4444" : color}
                strokeWidth={country.isMe ? 2.5 : 1.5}
                style={{ cursor: onCountryClick ? "pointer" : "default" }}
                whileHover={onCountryClick ? { opacity: 0.8 } : {}}
                onClick={() => onCountryClick?.(country.id)}
                animate={{
                  fillOpacity: eliminated ? 0.15 : [0.33, 0.45, 0.33],
                }}
                transition={{
                  fillOpacity: { repeat: Infinity, duration: 2.5, ease: "easeInOut" },
                }}
              />
              {/* Glow ring for "me" */}
              {country.isMe && !eliminated && (
                <motion.path
                  d={d}
                  fill="none"
                  stroke={color}
                  strokeWidth="3"
                  animate={{ strokeOpacity: [0.8, 0.2, 0.8] }}
                  transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
                />
              )}
              {/* Flag label */}
              {label && (
                <text
                  x={label.x}
                  y={label.y}
                  textAnchor="middle"
                  fontSize="12"
                  fill={eliminated ? "#ef444488" : "white"}
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {country.flag}
                </text>
              )}
            </g>
          );
        })}

        {/* Attack animations */}
        {attacks.map((attack) => (
          <g key={attack.id}>
            <motion.line
              x1={attack.fromX}
              y1={attack.fromY}
              x2={attack.fromX}
              y2={attack.fromY}
              stroke={attack.color}
              strokeWidth="2"
              strokeDasharray="6 4"
              initial={{ x2: attack.fromX, y2: attack.fromY }}
              animate={{ x2: attack.toX, y2: attack.toY }}
              transition={{ duration: 0.8, ease: "easeIn" }}
            />
            <motion.circle
              cx={attack.toX}
              cy={attack.toY}
              r={0}
              fill={attack.color}
              stroke={attack.color}
              fillOpacity={0.3}
              initial={{ r: 0, opacity: 1 }}
              animate={{ r: 20, opacity: 0 }}
              transition={{ delay: 0.8, duration: 0.6, ease: "easeOut" }}
            />
          </g>
        ))}
      </svg>

      {/* Legend */}
      <div className="absolute bottom-2 right-3 flex flex-wrap gap-2 justify-end max-w-[60%]">
        {gameCountries.map((country) => (
          <div
            key={country.id}
            className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
            style={{
              background: country.eliminated ? "rgba(239,68,68,0.15)" : `${colorMap[country.id]}22`,
              border: `1px solid ${country.eliminated ? "#ef444455" : colorMap[country.id] + "66"}`,
              color: country.eliminated ? "#ef4444aa" : colorMap[country.id],
              textDecoration: country.eliminated ? "line-through" : "none",
            }}
          >
            {country.flag} {country.name}
          </div>
        ))}
      </div>
    </div>
  );
}
