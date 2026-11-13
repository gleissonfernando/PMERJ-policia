/**
 * Fundo das telas públicas: grade de ruas, brilho de giroflex e o
 * horizonte do Rio (Corcovado com o Cristo, prédios e Pão de Açúcar com bondinho).
 */

// Alturas fixas → o horizonte é sempre o mesmo (sem "pular" a cada render).
const BUILDINGS: ReadonlyArray<readonly [x: number, w: number, h: number]> = [
  [0, 38, 62], [36, 30, 88], [64, 44, 54], [106, 26, 104], [130, 40, 72], [168, 34, 46],
  [640, 30, 58], [668, 42, 96], [708, 28, 124], [734, 46, 84], [778, 32, 112], [808, 40, 70],
  [846, 26, 136], [870, 44, 92], [912, 30, 64], [940, 36, 50],
  [1390, 30, 56], [1418, 22, 40],
]

export function Background() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="city-grid absolute inset-0" />

      <svg
        className="absolute inset-x-0 bottom-0 h-[min(32vh,280px)] w-full opacity-45"
        viewBox="0 0 1440 260"
        preserveAspectRatio="xMidYMax slice"
      >
        <defs>
          <linearGradient id="skyline-fill" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#5a0200" />
            <stop offset="0.55" stopColor="#1d1d1d" />
            <stop offset="1" stopColor="#262626" />
          </linearGradient>
          <linearGradient id="skyline-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#070707" stopOpacity="0" />
            <stop offset="1" stopColor="#070707" stopOpacity="0.85" />
          </linearGradient>
        </defs>

        <g fill="url(#skyline-fill)">
          {/* Corcovado + Cristo Redentor */}
          <path d="M180 260C260 230 330 190 390 140C420 115 440 82 452 72H468C478 90 500 120 540 150C590 185 650 215 720 260Z" />
          <rect x="453" y="66" width="14" height="8" />
          <rect x="457" y="33" width="6" height="36" />
          <rect x="440" y="41" width="40" height="4" rx="2" />
          <circle cx="460" cy="29" r="4" />

          {/* Morro da Urca + Pão de Açúcar */}
          <path d="M960 260C1010 220 1060 175 1105 168C1140 165 1165 190 1185 215L1190 260Z" />
          <path d="M1150 260C1170 200 1200 110 1250 78C1275 64 1300 68 1318 95C1345 140 1370 210 1400 260Z" />

          {BUILDINGS.map(([x, w, h]) => (
            <rect key={x} x={x} y={260 - h} width={w} height={h} />
          ))}
        </g>

        {/* Bondinho */}
        <line x1="1105" y1="168" x2="1256" y2="75" stroke="#2c2c2c" strokeWidth="1.2" />
        <rect x="1176" y="122" width="7" height="5" rx="1" fill="#e10600" className="animate-siren" />

        <rect width="1440" height="260" fill="url(#skyline-fade)" />
      </svg>

      <div className="lightbar absolute inset-x-0 top-0 h-[3px]" />
    </div>
  )
}
