import { MapView } from './MapView';
import type { MapViewMode, OverlayType } from '../../types/map';
import type { Property } from '../../types/property';
import type { MapPriceMode } from '../../App';

interface Props {
  viewMode: MapViewMode;
  activeOverlays: Set<OverlayType>;
  properties: Property[];
  selectedId: string | null;
  onSelectProperty: (id: string) => void;
  onMarkerScreenPosition?: (pos: { x: number; y: number } | null) => void;
  mapPriceMode: MapPriceMode;
  onMapPriceModeChange: (mode: MapPriceMode) => void;
  netMonthlyMap: Map<string, number> | null;
}

export function CenterPanel(props: Props) {
  return (
    <div className="w-full h-full relative">
      <MapView {...props} />
    </div>
  );
}
