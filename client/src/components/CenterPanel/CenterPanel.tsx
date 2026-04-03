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
  netMonthlyMap: Map<string, number> | null;
  schoolAgeGroups: Array<'elementary' | 'middle' | 'high'>;
  schoolRadiusMiles: number;
  groceryRadiusMiles: number;
  activeRoute?: {
    geometry: { type: 'LineString'; coordinates: [number, number][] };
    toCoordinates: [number, number];
    toName: string;
    toAddress: string;
    sourcePropertyAddress: string;
  } | null;
  onClearRoute?: () => void;
  onReopenDetail?: () => void;
}

export function CenterPanel(props: Props) {
  return (
    <div className="w-full h-full relative">
      <MapView {...props} />
    </div>
  );
}
