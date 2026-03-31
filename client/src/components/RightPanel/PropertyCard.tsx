import { Bed, Bath, Square, Clock, Eye, Heart } from 'lucide-react';
import type { Property } from '../../types/property';
import { formatPrice, formatSqft } from '../../utils/formatters';

interface Props {
  property: Property;
  selected: boolean;
  onClick: () => void;
}

export function PropertyCard({ property, selected, onClick }: Props) {
  return (
    <div
      onClick={onClick}
      className={`cursor-pointer rounded-xl overflow-hidden border transition-all ${
        selected
          ? 'border-[#6366f1] bg-[#25253e] shadow-lg shadow-indigo-900/30'
          : 'border-[#2d2d4a] bg-[#25253e] hover:border-[#6366f1]/50'
      }`}
    >
      <div className="relative h-36 bg-[#2d2d4a] overflow-hidden">
        <img src={property.imageUrl} alt={property.streetAddress}
          className="w-full h-full object-cover"
          onError={(e) => { (e.target as HTMLImageElement).src = 'https://placehold.co/400x300/25253e/6366f1?text=No+Image'; }} />
        <div className="absolute top-2 left-2 flex gap-1.5">
          <span className="bg-[#0f0f1a]/80 text-[#e2e2f0] text-[10px] px-2 py-0.5 rounded-md font-medium backdrop-blur-sm">
            {property.homeType}
          </span>
          {property.flexText && (
            <span className="bg-[#6366f1]/80 text-white text-[10px] px-2 py-0.5 rounded-md font-medium backdrop-blur-sm">
              {property.flexText}
            </span>
          )}
        </div>
        <div className="absolute top-2 right-2">
          <span className="bg-[#6366f1] text-white text-xs px-2 py-1 rounded-md font-bold">{formatPrice(property.price)}</span>
        </div>
        <div className="absolute bottom-2 left-2 flex gap-2 text-[10px] text-white/80">
          {property.daysOnZillow > 0 && (
            <span className="flex items-center gap-0.5 bg-black/50 px-1.5 py-0.5 rounded backdrop-blur-sm">
              <Clock size={9} /> {property.daysOnZillow}d
            </span>
          )}
          {property.pageViews > 0 && (
            <span className="flex items-center gap-0.5 bg-black/50 px-1.5 py-0.5 rounded backdrop-blur-sm">
              <Eye size={9} /> {property.pageViews.toLocaleString()}
            </span>
          )}
          {property.favorites > 0 && (
            <span className="flex items-center gap-0.5 bg-black/50 px-1.5 py-0.5 rounded backdrop-blur-sm">
              <Heart size={9} /> {property.favorites}
            </span>
          )}
        </div>
      </div>

      <div className="p-3">
        <p className="text-[#e2e2f0] text-sm font-medium truncate">{property.streetAddress}</p>
        <p className="text-[#8888a8] text-xs mb-2">{property.city}, {property.state} {property.zip}</p>

        <div className="flex items-center gap-3 text-xs text-[#8888a8]">
          <span className="flex items-center gap-1"><Bed size={12} />{property.beds} bd</span>
          <span className="flex items-center gap-1"><Bath size={12} />{property.baths} ba</span>
          <span className="flex items-center gap-1"><Square size={12} />{formatSqft(property.sqft)} sqft</span>
          {property.pricePerSqft && <span className="ml-auto">${property.pricePerSqft}/sqft</span>}
        </div>
      </div>

      {selected && (
        <div className="px-3 pb-3">
          <div className="h-px bg-[#2d2d4a] mb-2" />
          <p className="text-[#6366f1] text-xs font-medium">Click again to open full details</p>
        </div>
      )}
    </div>
  );
}
