import type { Property } from '../types/property';

export type ChatMessageRole = 'user' | 'assistant';

export interface ChatMessage {
  role: ChatMessageRole;
  content: string;
}

export interface ChatResponse {
  message: string;
  /** Present when the model invoked `search_listings` in this request (may be empty). */
  listingIds?: string[];
  filterPatch?: ChatFilterPatch;
  unsupportedConstraints?: string[];
}

export interface ChatPostResult {
  message: string;
  listingIds?: string[];
  filterPatch?: ChatFilterPatch;
  unsupportedConstraints?: string[];
}

export type CrimeRiskFilter = 'any' | 'low' | 'medium' | 'high';
export type NoiseRiskFilter = 'any' | 'low' | 'medium' | 'high';
export type SchoolAgeFilter = 'elementary' | 'middle' | 'high';

export interface ChatFilterPatch {
  min_price?: number;
  max_price?: number;
  min_beds?: number;
  min_baths?: number;
  crime_risk?: CrimeRiskFilter;
  noise_risk?: NoiseRiskFilter;
  school_age_groups?: SchoolAgeFilter[];
  school_radius_miles?: number;
  grocery_radius_miles?: number;
}

/** Slim payload for the server system prompt (keeps request size reasonable). */
export function serializePropertyForChat(p: Property): Record<string, unknown> {
  return {
    id: p.id,
    address: p.address,
    streetAddress: p.streetAddress,
    city: p.city,
    state: p.state,
    zip: p.zip,
    price: p.price,
    beds: p.beds,
    baths: p.baths,
    sqft: p.sqft,
    yearBuilt: p.yearBuilt,
    homeType: p.homeType,
    coordinates: p.coordinates,
    description: p.description ? p.description.slice(0, 2500) : '',
    lotSize: p.lotSize,
    pricePerSqft: p.pricePerSqft,
    daysOnZillow: p.daysOnZillow,
    pageViews: p.pageViews,
    favorites: p.favorites,
    statusText: p.statusText,
    flexText: p.flexText,
    heating: p.heating,
    cooling: p.cooling,
    parking: p.parking,
    appliances: p.appliances,
    basement: p.basement,
    constructionMaterials: p.constructionMaterials,
    hoaFee: p.hoaFee,
    zestimate: p.zestimate,
    rentZestimate: p.rentZestimate,
    crimeIncidentCount: p.crimeIncidentCount,
    crimeRiskRadiusMiles: p.crimeRiskRadiusMiles,
    crimeRiskLevel: p.crimeRiskLevel,
    noiseExposureDbAvg: p.noiseExposureDbAvg,
    noiseExposureRadiusMiles: p.noiseExposureRadiusMiles,
    noiseExposureDecayMiles: p.noiseExposureDecayMiles,
    noiseExposureLevel: p.noiseExposureLevel,
    schools: p.schools.slice(0, 10),
    brokerName: p.brokerName,
    agentName: p.agentName,
    agentPhone: p.agentPhone,
    priceHistory: p.priceHistory.slice(0, 8),
    detailUrl: p.detailUrl,
  };
}

export async function postChat(
  messages: ChatMessage[],
  options?: { focusedProperty?: Property | null; mode?: 'browse' | 'guided'; compareProperties?: Property[] | null },
): Promise<ChatPostResult> {
  const body: {
    messages: ChatMessage[];
    focusedProperty?: Record<string, unknown>;
    mode?: 'browse' | 'guided';
    compareProperties?: Record<string, unknown>[];
  } = { messages };
  if (options?.focusedProperty) {
    body.focusedProperty = serializePropertyForChat(options.focusedProperty);
  }
  if (options?.mode) {
    body.mode = options.mode;
  }
  if (options?.compareProperties && options.compareProperties.length >= 2) {
    body.compareProperties = options.compareProperties.map((p) => serializePropertyForChat(p));
  }
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as ChatResponse & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `Chat request failed (${res.status})`);
  }
  if (!data.message) {
    throw new Error('No message in response');
  }
  return {
    message: data.message,
    listingIds: data.listingIds,
    filterPatch: data.filterPatch,
    unsupportedConstraints: data.unsupportedConstraints,
  };
}
