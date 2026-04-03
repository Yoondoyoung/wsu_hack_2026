export interface Property {
  id: string;
  address: string;
  streetAddress: string;
  city: string;
  state: string;
  zip: string;
  price: number;
  beds: number;
  baths: number;
  sqft: number;
  yearBuilt: number;
  coordinates: [number, number]; // [lng, lat]
  homeType: string;
  imageUrl: string;
  photos: string[];
  detailUrl: string;
  // Detail fields
  description: string;
  lotSize: number | null;
  pricePerSqft: number | null;
  daysOnZillow: number;
  pageViews: number;
  favorites: number;
  heating: string[];
  cooling: string[];
  parking: string[];
  appliances: string[];
  basement: string | null;
  constructionMaterials: string[];
  brokerName: string;
  agentName: string;
  agentPhone: string;
  hoaFee: number | null;
  zestimate: number | null;
  rentZestimate: number | null;
  schools: SchoolInfo[];
  priceHistory: PriceHistoryItem[];
  statusText: string;
  flexText: string;
  /** Mapped incidents within crimeRiskRadiusMiles (server-computed from crime overlay). */
  crimeIncidentCount: number;
  /** Haversine radius in miles used for crimeIncidentCount (e.g. 0.5). */
  crimeRiskRadiusMiles: number;
  /** low / medium / high by tertiles within the current listing batch (not absolute crime rate). */
  crimeRiskLevel: 'low' | 'medium' | 'high';
  /** Nearest grocery distance in miles (server-computed). */
  nearestGroceryDistanceMiles?: number | null;
}

export interface SchoolInfo {
  name: string;
  rating: number;
  distance: number;
  level: string;
  type: string;
  link: string;
  grades?: string | null;
}

export interface PriceHistoryItem {
  date: string;
  event: string;
  price: number;
  source: string;
}
