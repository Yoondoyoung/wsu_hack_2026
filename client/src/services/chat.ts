import type { Property } from '../types/property';
import type { MortgageRequestPayload, MortgageResponse } from '../types/mortgage';
import type { TcoInputs } from '../utils/tcoCalculator';

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

export interface MortgagePredictorFormState {
  annualIncome: number;
  totalDebt: number;
  loanAmount: number;
  downPayment: number;
}

export interface MortgageScenarioSnapshot {
  label: string;
  delta: number;
  confidence: number;
}

export interface FocusedMortgagePredictorContext {
  inputs: MortgagePredictorFormState;
  lastPayload?: MortgageRequestPayload;
  lastResult?: MortgageResponse;
  topScenarios?: MortgageScenarioSnapshot[];
  error?: string | null;
}

export interface FocusedTcoContext {
  inputs: TcoInputs;
  principalInterest: number;
  propertyTax: number;
  insurance: number;
  maintenance: number;
  hoa: number;
  pmi: number;
  grossMonthly: number;
  rentalIncome: number;
  netMonthly: number;
}

export interface FocusedAnalysisContext {
  propertyId: string;
  tco: FocusedTcoContext;
  mortgagePredictor?: FocusedMortgagePredictorContext;
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

function sanitizeFiniteNumber(n: unknown): number | undefined {
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

function serializeFocusedAnalysisForChat(ctx: FocusedAnalysisContext): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    propertyId: ctx.propertyId,
    tco: {
      inputs: {
        interestRate: ctx.tco.inputs.interestRate,
        downPercent: ctx.tco.inputs.downPercent,
        rentPercent: ctx.tco.inputs.rentPercent,
        maintenanceMonthlyOverride: ctx.tco.inputs.maintenanceMonthlyOverride ?? null,
      },
      principalInterest: Math.round(ctx.tco.principalInterest),
      propertyTax: Math.round(ctx.tco.propertyTax),
      insurance: Math.round(ctx.tco.insurance),
      maintenance: Math.round(ctx.tco.maintenance),
      hoa: Math.round(ctx.tco.hoa),
      pmi: Math.round(ctx.tco.pmi),
      grossMonthly: Math.round(ctx.tco.grossMonthly),
      rentalIncome: Math.round(ctx.tco.rentalIncome),
      netMonthly: Math.round(ctx.tco.netMonthly),
    },
  };

  if (ctx.mortgagePredictor) {
    const mp = ctx.mortgagePredictor;
    const predictor: Record<string, unknown> = {
      inputs: {
        annualIncome: Math.round(mp.inputs.annualIncome),
        totalDebt: Math.round(mp.inputs.totalDebt),
        loanAmount: Math.round(mp.inputs.loanAmount),
        downPayment: Math.round(mp.inputs.downPayment),
      },
    };
    if (mp.lastPayload) predictor.lastPayload = mp.lastPayload;
    if (mp.lastResult) predictor.lastResult = mp.lastResult;
    if (mp.topScenarios?.length) predictor.topScenarios = mp.topScenarios.slice(0, 2);
    if (mp.error) predictor.error = mp.error;
    payload.mortgagePredictor = predictor;
  }

  const net = sanitizeFiniteNumber((payload.tco as Record<string, unknown>).netMonthly);
  if (net != null && net < 0) {
    payload.note = 'Negative netMonthly means estimated rental income offsets total costs.';
  }
  return payload;
}

export async function postChat(
  messages: ChatMessage[],
  options?: {
    focusedProperty?: Property | null;
    mode?: 'browse' | 'guided';
    compareProperties?: Property[] | null;
    focusedAnalysis?: FocusedAnalysisContext | null;
  },
): Promise<ChatPostResult> {
  const body: {
    messages: ChatMessage[];
    focusedProperty?: Record<string, unknown>;
    mode?: 'browse' | 'guided';
    compareProperties?: Record<string, unknown>[];
    focusedAnalysis?: Record<string, unknown>;
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
  if (options?.focusedAnalysis) {
    body.focusedAnalysis = serializeFocusedAnalysisForChat(options.focusedAnalysis);
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
