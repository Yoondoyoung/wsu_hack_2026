import { useState, type ElementType, type ReactNode } from 'react';
import {
  X, ChevronLeft, ChevronRight, Bed, Bath, Square, Flame, Snowflake, Car, Wrench, Building,
  GraduationCap, User, Phone, Clock, Eye, Heart, TrendingUp, ExternalLink, ShieldAlert,
} from 'lucide-react';
import type { Property } from '../../types/property';
import { formatPrice, formatSqft } from '../../utils/formatters';
import { crimeRiskLabel } from '../../utils/crimeRisk';

interface Props {
  property: Property;
  onClose: () => void;
}

function Section({ title, icon: Icon, children }: { title: string; icon: ElementType; children: ReactNode }) {
  return (
    <div>
      <h3 className="flex items-center gap-2 text-[#e2e2f0] text-sm font-semibold mb-2">
        <Icon size={14} className="text-[#6366f1]" />{title}
      </h3>
      {children}
    </div>
  );
}

function Pill({ text }: { text: string }) {
  return <span className="bg-[#0f0f1a] text-[#8888a8] text-xs px-2 py-1 rounded-md">{text}</span>;
}

function Stat({ label, value }: { label: string; value: string | number | null }) {
  if (value == null) return null;
  return (
    <div className="bg-[#0f0f1a] rounded-lg p-2.5">
      <p className="text-[#8888a8] text-[10px] uppercase tracking-wide">{label}</p>
      <p className="text-[#e2e2f0] text-sm font-semibold">{value}</p>
    </div>
  );
}

export function PropertyDetail({ property, onClose }: Props) {
  const [photoIdx, setPhotoIdx] = useState(0);
  const photos = property.photos.length > 0 ? property.photos : [property.imageUrl];

  const prevPhoto = () => setPhotoIdx((i) => (i - 1 + photos.length) % photos.length);
  const nextPhoto = () => setPhotoIdx((i) => (i + 1) % photos.length);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}>
      <div className="bg-[#1a1a2e] border border-[#2d2d4a] rounded-2xl w-[680px] max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}>

        {/* Photo Gallery */}
        <div className="relative h-72 bg-[#0f0f1a] flex-shrink-0">
          <img src={photos[photoIdx]} alt={property.streetAddress}
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).src = 'https://placehold.co/768x400/25253e/6366f1?text=No+Image'; }} />
          {photos.length > 1 && (
            <>
              <button onClick={prevPhoto}
                className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white p-2 rounded-full">
                <ChevronLeft size={18} />
              </button>
              <button onClick={nextPhoto}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white p-2 rounded-full">
                <ChevronRight size={18} />
              </button>
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-1 rounded-full">
                {photoIdx + 1} / {photos.length}
              </div>
            </>
          )}
          <button onClick={onClose}
            className="absolute top-3 right-3 bg-black/60 hover:bg-black/80 text-white p-2 rounded-full">
            <X size={16} />
          </button>
          <div className="absolute top-3 left-3">
            <span className="bg-[#6366f1] text-white text-xs px-3 py-1.5 rounded-lg font-bold">{property.statusText}</span>
          </div>
        </div>

        {/* Photo thumbnails */}
        {photos.length > 1 && (
          <div className="flex gap-1 px-4 py-2 bg-[#0f0f1a] overflow-x-auto flex-shrink-0">
            {photos.slice(0, 10).map((photo, i) => (
              <button key={i} onClick={() => setPhotoIdx(i)}
                className={`flex-shrink-0 w-14 h-10 rounded-md overflow-hidden border-2 transition-colors ${
                  i === photoIdx ? 'border-[#6366f1]' : 'border-transparent opacity-60 hover:opacity-100'}`}>
                <img src={photo} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Header */}
          <div>
            <div className="flex items-start justify-between mb-1">
              <h2 className="text-[#e2e2f0] text-xl font-bold">{formatPrice(property.price)}</h2>
              <div className="flex gap-2 text-xs text-[#8888a8]">
                {property.daysOnZillow > 0 && <span className="flex items-center gap-1"><Clock size={10} />{property.daysOnZillow}d on market</span>}
                {property.pageViews > 0 && <span className="flex items-center gap-1"><Eye size={10} />{property.pageViews.toLocaleString()}</span>}
                {property.favorites > 0 && <span className="flex items-center gap-1"><Heart size={10} />{property.favorites}</span>}
              </div>
            </div>
            <p className="text-[#e2e2f0] text-sm">{property.address}</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-[#8888a8]">
              <span className="flex items-center gap-1"><Bed size={14} />{property.beds} beds</span>
              <span className="flex items-center gap-1"><Bath size={14} />{property.baths} baths</span>
              <span className="flex items-center gap-1"><Square size={14} />{formatSqft(property.sqft)} sqft</span>
              <span className="flex items-center gap-1" title="Reported incidents within 2 miles">
                <ShieldAlert size={14} className="text-[#f87171]" />
                {crimeRiskLabel(property.crimeRiskLevel)} ({property.crimeIncidentCount ?? 0} within {property.crimeRiskRadiusMiles ?? 0.5} mi)
              </span>
            </div>
            {property.detailUrl && (
              <a
                href={property.detailUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs text-[#818cf8] hover:text-[#a5b4fc]"
              >
                View source listing <ExternalLink size={12} />
              </a>
            )}
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-4 gap-2">
            <Stat label="Year Built" value={property.yearBuilt || null} />
            <Stat label="Lot Size" value={property.lotSize ? `${property.lotSize.toLocaleString()} sqft` : null} />
            <Stat label="$/Sqft" value={property.pricePerSqft ? `$${property.pricePerSqft}` : null} />
            <Stat label="Type" value={property.homeType} />
            {property.zestimate && <Stat label="Zestimate" value={formatPrice(property.zestimate)} />}
            {property.rentZestimate && <Stat label="Rent Estimate" value={`${formatPrice(property.rentZestimate)}/mo`} />}
            {property.hoaFee && <Stat label="HOA Fee" value={`${formatPrice(property.hoaFee)}/mo`} />}
          </div>

          {/* Description */}
          {property.description && (
            <Section title="Description" icon={Building}>
              <p className="text-[#8888a8] text-xs leading-relaxed">{property.description}</p>
            </Section>
          )}

          {/* Features */}
          <div className="grid grid-cols-2 gap-4">
            {property.heating.length > 0 && (
              <Section title="Heating" icon={Flame}>
                <div className="flex flex-wrap gap-1">{property.heating.map((h) => <Pill key={h} text={h} />)}</div>
              </Section>
            )}
            {property.cooling.length > 0 && (
              <Section title="Cooling" icon={Snowflake}>
                <div className="flex flex-wrap gap-1">{property.cooling.map((c) => <Pill key={c} text={c} />)}</div>
              </Section>
            )}
            {property.parking.length > 0 && (
              <Section title="Parking" icon={Car}>
                <div className="flex flex-wrap gap-1">{property.parking.map((p) => <Pill key={p} text={p} />)}</div>
              </Section>
            )}
            {property.appliances.length > 0 && (
              <Section title="Appliances" icon={Wrench}>
                <div className="flex flex-wrap gap-1">{property.appliances.map((a) => <Pill key={a} text={a} />)}</div>
              </Section>
            )}
            {property.constructionMaterials.length > 0 && (
              <Section title="Construction" icon={Building}>
                <div className="flex flex-wrap gap-1">{property.constructionMaterials.map((c) => <Pill key={c} text={c} />)}</div>
              </Section>
            )}
            {property.basement && (
              <Section title="Basement" icon={Building}>
                <Pill text={property.basement} />
              </Section>
            )}
          </div>

          {/* Schools */}
          {property.schools.length > 0 && (
            <Section title="Nearby Schools" icon={GraduationCap}>
              <div className="space-y-2">
                {property.schools.map((s, i) => (
                  <div key={`${s.name}-${i}`} className="flex items-center gap-3 bg-[#0f0f1a] rounded-lg p-2.5">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                      s.rating >= 7 ? 'bg-green-900/50 text-green-400' :
                      s.rating >= 4 ? 'bg-yellow-900/50 text-yellow-400' :
                      'bg-red-900/50 text-red-400'}`}>
                      {s.rating || 'N/A'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[#e2e2f0] text-xs font-medium truncate">{s.name}</p>
                      <p className="text-[#8888a8] text-[10px]">
                        {s.level || 'N/A'} &middot; {s.distance} mi &middot; {s.type || 'School'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Price History */}
          {property.priceHistory.length > 0 && (
            <Section title="Price History" icon={TrendingUp}>
              <div className="space-y-1">
                {property.priceHistory.slice(0, 5).map((p, i) => (
                  <div key={i} className="flex items-center gap-3 text-xs text-[#8888a8]">
                    <span className="w-20 flex-shrink-0">{p.date}</span>
                    <span className="w-24 flex-shrink-0">{p.event}</span>
                    <span className="text-[#e2e2f0] font-medium">{p.price > 0 ? formatPrice(p.price) : '—'}</span>
                    <span className="ml-auto text-[10px]">{p.source}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Agent Info */}
          {(property.brokerName || property.agentName) && (
            <Section title="Listing Agent" icon={User}>
              <div className="bg-[#0f0f1a] rounded-lg p-3">
                {property.agentName && <p className="text-[#e2e2f0] text-sm font-medium">{property.agentName}</p>}
                {property.brokerName && <p className="text-[#8888a8] text-xs">{property.brokerName}</p>}
                {property.agentPhone && (
                  <p className="text-[#6366f1] text-xs mt-1 flex items-center gap-1">
                    <Phone size={10} />{property.agentPhone}
                  </p>
                )}
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
