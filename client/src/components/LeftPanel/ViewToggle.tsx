import { Globe, Satellite, Box } from 'lucide-react';
import type { MapViewMode } from '../../types/map';
import { colors } from '../../design';

interface Props {
  current: MapViewMode;
  onChange: (mode: MapViewMode) => void;
  collapsed: boolean;
}

const MODES: { mode: MapViewMode; label: string; Icon: React.ElementType }[] = [
  { mode: 'default', label: 'Default', Icon: Globe },
  { mode: 'satellite', label: 'Satellite', Icon: Satellite },
  { mode: '3d', label: '3D', Icon: Box },
];

export function ViewToggle({ current, onChange, collapsed }: Props) {
  if (collapsed) {
    return (
      <div className="flex flex-col gap-1.5 items-center">
        {MODES.map(({ mode, label, Icon }) => {
          const active = current === mode;
          return (
            <button
              key={mode}
              onClick={() => onChange(mode)}
              title={label}
              className="w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200"
              style={{
                background: active ? `rgba(0,200,255,0.12)` : 'transparent',
                border: active ? `1px solid rgba(0,200,255,0.22)` : '1px solid transparent',
              }}
            >
              <Icon
                size={15}
                style={{
                  color: active ? colors.cyan : colors.whiteSubtle,
                  filter: active ? `drop-shadow(0 0 4px ${colors.cyan})` : 'none',
                }}
              />
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className="flex p-1.5 gap-0.5"
      style={{
        background: colors.whiteSoft,
        border: `1px solid ${colors.border}`,
        borderRadius: 12,
      }}
    >
      {MODES.map(({ mode, label, Icon }) => {
        const active = current === mode;
        return (
          <button
            key={mode}
            onClick={() => onChange(mode)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-[9px] text-xs font-medium transition-all duration-200"
            style={{
              background: active ? `rgba(0,200,255,0.1)` : 'transparent',
              color: active ? colors.cyan : colors.whiteSubtle,
              border: active ? `1px solid rgba(0,200,255,0.18)` : '1px solid transparent',
              boxShadow: active ? `0 0 10px rgba(0,200,255,0.08)` : 'none',
            }}
          >
            <Icon
              size={13}
              style={{ filter: active ? `drop-shadow(0 0 4px ${colors.cyan})` : 'none' }}
            />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
