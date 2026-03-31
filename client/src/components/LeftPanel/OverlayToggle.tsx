import { ShieldAlert, GraduationCap, Users, Volume2, Building2 } from 'lucide-react';
import type { OverlayType } from '../../types/map';
import { colors } from '../../design';

interface Props {
  activeOverlays: Set<OverlayType>;
  onToggle: (overlay: OverlayType) => void;
  collapsed: boolean;
}

const OVERLAYS: {
  type: OverlayType;
  label: string;
  Icon: React.ElementType;
  color: string;
}[] = [
  { type: 'crime',      label: 'Crime Hotspots',      Icon: ShieldAlert,   color: colors.red     },
  { type: 'schools',    label: 'School Districts',     Icon: GraduationCap, color: colors.emerald },
  { type: 'population', label: 'Population Density',   Icon: Users,         color: colors.blue    },
  { type: 'noise',      label: 'Noise Levels',         Icon: Volume2,       color: colors.yellow  },
  { type: 'structures', label: 'Building Footprints',  Icon: Building2,     color: colors.cyan    },
];

function hexToRgba(hex: string, alpha: number) {
  // For the rgba colors already in colors object, just wrap them
  if (hex.startsWith('rgba') || hex.startsWith('rgb')) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function OverlayToggle({ activeOverlays, onToggle, collapsed }: Props) {
  return (
    <div className="flex flex-col gap-1">
      {OVERLAYS.map(({ type, label, Icon, color }) => {
        const active = activeOverlays.has(type);
        const bgActive = hexToRgba(color, 0.08);
        const glowColor = hexToRgba(color, 0.35);

        if (collapsed) {
          return (
            <button
              key={type}
              onClick={() => onToggle(type)}
              title={label}
              className="w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 mx-auto"
              style={{
                background: active ? hexToRgba(color, 0.12) : 'transparent',
                border: active ? `1px solid ${hexToRgba(color, 0.3)}` : '1px solid transparent',
              }}
            >
              <Icon
                size={14}
                style={{
                  color: active ? color : colors.whiteSubtle,
                  filter: active ? `drop-shadow(0 0 4px ${glowColor})` : 'none',
                  transition: 'all 0.2s',
                }}
              />
            </button>
          );
        }

        return (
          <button
            key={type}
            onClick={() => onToggle(type)}
            className="group flex items-center gap-3 pl-4 pr-3.5 py-2.5 rounded-xl transition-all duration-200 relative overflow-hidden text-left min-w-0"
            style={{ background: active ? bgActive : 'transparent' }}
            onMouseEnter={(e) => {
              if (!active) (e.currentTarget as HTMLElement).style.background = colors.whiteTint;
            }}
            onMouseLeave={(e) => {
              if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent';
            }}
          >
            {/* Left accent bar */}
            <div
              className="absolute left-0 top-2 bottom-2 rounded-full transition-all duration-300"
              style={{
                width: 2,
                background: color,
                boxShadow: active ? `0 0 6px ${glowColor}` : 'none',
                opacity: active ? 1 : 0,
              }}
            />

            <Icon
              size={14}
              style={{
                color: active ? color : colors.whiteSubtle,
                filter: active ? `drop-shadow(0 0 5px ${glowColor})` : 'none',
                transition: 'all 0.25s',
                flexShrink: 0,
              }}
            />

            <span
              className="flex-1 text-xs font-medium transition-colors duration-200 min-w-0 pr-0.5"
              style={{ color: active ? colors.white : colors.whiteSubtle }}
            >
              {label}
            </span>

            {/* Toggle pill */}
            <div
              className="relative flex-shrink-0"
              style={{
                width: 30,
                height: 16,
                borderRadius: 8,
                background: active ? color : colors.whiteDim,
                boxShadow: active ? `0 0 8px ${glowColor}` : 'none',
                transition: 'background 0.3s, box-shadow 0.3s',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 2,
                  left: active ? 14 : 2,
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: 'white',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                  transition: 'left 0.3s cubic-bezier(0.34,1.56,0.64,1)',
                }}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}
