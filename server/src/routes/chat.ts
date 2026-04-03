import { Router } from 'express';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { getPropertyPayloadsForChat } from './properties.js';

export const CHAT_SYSTEM_PROMPT =
  'You are a mortgage expert and a real estate expert. Help users by answering their questions about mortgages, real estate, home buying, and closely related financial topics. If a question is outside this scope, politely decline: you cannot answer questions that are outside your area of expertise.';

const MAX_MESSAGES = 24;
const MAX_TOTAL_CHARS = 12000;
const MAX_TOOL_ROUNDS = 5;
/** Preview rows sent to the model (token limit). */
const MAX_LISTING_PREVIEW = 15;
/** Max property IDs sent to the client for map/list (must match total_matched when below cap). */
const MAX_IDS_FOR_UI = 2000;

type ChatRole = 'user' | 'assistant';

interface IncomingMessage {
  role: ChatRole;
  content: string;
}

type GenericRow = Record<string, unknown>;

interface SearchListingsArgs {
  query?: string;
  min_price?: number;
  max_price?: number;
  min_beds?: number;
  max_beds?: number;
  limit?: number;
}

type ChatMode = 'browse' | 'guided';
type CrimeRiskFilter = 'any' | 'low' | 'medium' | 'high';
type SchoolAgeFilter = 'elementary' | 'middle' | 'high';

interface SetFiltersArgs {
  min_price?: number;
  max_price?: number;
  min_beds?: number;
  min_baths?: number;
  crime_risk?: CrimeRiskFilter;
  school_age_groups?: SchoolAgeFilter[];
  school_radius_miles?: number;
  grocery_radius_miles?: number;
  unsupported_constraints?: string[];
}

function extractGuidedPatchFromText(text: string): SetFiltersArgs | undefined {
  const lower = text.toLowerCase();
  const patch: SetFiltersArgs = {};

  const underK = lower.match(/(?:under|below|less than)\s*\$?\s*(\d{2,4})\s*k\b/);
  if (underK) {
    patch.max_price = Number(underK[1]) * 1000;
  } else {
    const underNum = lower.match(/(?:under|below|less than)\s*\$?\s*([0-9][0-9,]*)\b/);
    if (underNum) {
      patch.max_price = Number(underNum[1].replace(/,/g, ''));
    }
  }

  const minBeds = lower.match(/(\d+)\s*\+?\s*(?:bed|beds|bedroom|bedrooms)\b/);
  if (minBeds) patch.min_beds = Number(minBeds[1]);

  const minBaths = lower.match(/(\d+)\s*\+?\s*(?:bath|baths|bathroom|bathrooms)\b/);
  if (minBaths) patch.min_baths = Number(minBaths[1]);

  const groups: SchoolAgeFilter[] = [];
  if (/\belementary\b|\bprimary\b|\bkid\b|\bkids\b|\bchild\b|\bchildren\b/.test(lower)) groups.push('elementary');
  if (/\bmiddle\b|\bmiddle school\b|\bjunior\b/.test(lower)) groups.push('middle');
  if (/\bhigh school\b|\bteen\b|\bteens\b/.test(lower)) groups.push('high');
  if (groups.length > 0) patch.school_age_groups = Array.from(new Set(groups));

  const mile = lower.match(/(\d+(?:\.\d+)?)\s*(?:mile|miles|mi)\b/);
  if (mile) patch.school_radius_miles = Number(mile[1]);

  const groceryMentioned = /\bgrocery\b|\bsupermarket\b|\bmarket\b|\bmart\b/.test(lower);
  const nearMentioned = /\bnear\b|\bnearby\b|\bclose\b|\bwalkable\b|\bwalking distance\b/.test(lower);
  if (groceryMentioned && nearMentioned) {
    patch.grocery_radius_miles = 1;
  }

  const hasAny = Object.keys(patch).length > 0;
  return hasAny ? patch : undefined;
}

function num(row: GenericRow, key: string): number {
  const v = row[key];
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function str(row: GenericRow, key: string): string {
  const v = row[key];
  return typeof v === 'string' ? v : v != null ? String(v) : '';
}

function searchListings(rows: GenericRow[], args: SearchListingsArgs): {
  listings: object[];
  total_matched: number;
  matchingIdsForUi: string[];
  toolPayload: Record<string, unknown>;
} {
  const previewLimit = Math.min(MAX_LISTING_PREVIEW, Math.max(1, args.limit ?? 8));
  let filtered = rows.filter((row) => {
    const price = num(row, 'price');
    if (args.min_price != null && price < args.min_price) return false;
    if (args.max_price != null && price > args.max_price) return false;
    const beds = num(row, 'beds');
    if (args.min_beds != null && beds < args.min_beds) return false;
    if (args.max_beds != null && beds > args.max_beds) return false;
    return true;
  });

  const q = args.query?.trim().toLowerCase();
  if (q) {
    const parts = q.split(/\s+/).filter((p) => p.length > 0);
    filtered = filtered.filter((row) => {
      const blob = [
        str(row, 'address'),
        str(row, 'streetAddress'),
        str(row, 'city'),
        str(row, 'state'),
        str(row, 'zip'),
        str(row, 'description'),
        str(row, 'homeType'),
        str(row, 'propertyType'),
      ]
        .join(' ')
        .toLowerCase();
      return parts.every((p) => blob.includes(p));
    });
  }

  filtered.sort((a, b) => num(a, 'price') - num(b, 'price'));
  const total_matched = filtered.length;

  const matchingIdsForUi = filtered
    .slice(0, MAX_IDS_FOR_UI)
    .map((row) => str(row, 'id'))
    .filter((id) => id.length > 0);

  const previewSlice = filtered.slice(0, previewLimit);
  const listings = previewSlice.map((row) => ({
    id: str(row, 'id'),
    address: str(row, 'address'),
    city: str(row, 'city'),
    state: str(row, 'state'),
    zip: str(row, 'zip'),
    price: num(row, 'price'),
    beds: num(row, 'beds'),
    baths: num(row, 'baths'),
    sqft: num(row, 'sqft'),
    homeType: str(row, 'homeType') || str(row, 'propertyType'),
    detailUrl: str(row, 'detailUrl'),
  }));

  const idsTruncated = total_matched > matchingIdsForUi.length;
  const toolPayload: Record<string, unknown> = {
    listings,
    total_matched,
    listings_preview_count: listings.length,
    properties_shown_in_app: matchingIdsForUi.length,
    ids_truncated: idsTruncated,
  };
  if (idsTruncated) {
    toolPayload.note = `There are ${total_matched} matches; the app list and map include the first ${matchingIdsForUi.length} (sorted by price).`;
  }

  return { listings, total_matched, matchingIdsForUi, toolPayload };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function normalizeFilterPatch(args: SetFiltersArgs): { patch: SetFiltersArgs; unsupported: string[] } {
  const patch: SetFiltersArgs = {};
  if (typeof args.min_price === 'number') patch.min_price = clamp(Math.round(args.min_price), 0, 3000000);
  if (typeof args.max_price === 'number') patch.max_price = clamp(Math.round(args.max_price), 0, 3000000);
  if (typeof args.min_beds === 'number') patch.min_beds = clamp(Math.round(args.min_beds), 0, 10);
  if (typeof args.min_baths === 'number') patch.min_baths = clamp(Math.round(args.min_baths), 0, 10);
  if (args.crime_risk && ['any', 'low', 'medium', 'high'].includes(args.crime_risk)) patch.crime_risk = args.crime_risk;
  if (Array.isArray(args.school_age_groups)) {
    const valid = args.school_age_groups.filter((group): group is SchoolAgeFilter =>
      ['elementary', 'middle', 'high'].includes(group),
    );
    if (valid.length > 0) {
      const deduped = Array.from(new Set(valid));
      patch.school_age_groups = deduped;
      // UX default: if user specified child school ages but omitted distance,
      // apply 1 mile.
      if (typeof args.school_radius_miles !== 'number') {
        patch.school_radius_miles = 1;
      }
    }
  }
  if (typeof args.school_radius_miles === 'number') patch.school_radius_miles = clamp(args.school_radius_miles, 0, 10);
  if (typeof args.grocery_radius_miles === 'number') patch.grocery_radius_miles = clamp(args.grocery_radius_miles, 0, 5);
  const unsupported = Array.isArray(args.unsupported_constraints)
    ? args.unsupported_constraints
        .map((v) => (typeof v === 'string' ? v.trim() : ''))
        .filter((v) => v.length > 0)
        .slice(0, 6)
    : [];
  return { patch, unsupported };
}

function buildSystemPrompt(focusedProperty: unknown, mode: ChatMode): string {
  let base =
    CHAT_SYSTEM_PROMPT +
    '\n\nYou can call the search_listings tool to find real homes from the app’s Salt Lake area listing database. When the user asks for homes matching price, beds, or location keywords, use the tool. Describe only listings returned by the tool; do not invent addresses or prices.' +
    '\n\nAfter search_listings returns results: the app shows those homes in the right-hand list and on the map (properties_shown_in_app matches what the user sees; use total_matched for how many fit the search). If ids_truncated is true, say the app shows the first N matches of a larger set. Keep your chat reply short (2–4 sentences). Briefly confirm the criteria you used, state roughly how many matches there were (use total_matched from the tool if helpful), and say the matches are shown in the list—do not enumerate addresses, prices, or bed counts in the chat. If there are zero matches, say so in one or two sentences and suggest relaxing filters. Match the user’s language (e.g. Korean if they wrote in Korean).' +
    '\n\nFor mortgage or general questions that do not require search_listings, answer as usual with appropriate detail.';
  if (mode === 'guided') {
    base +=
      '\n\nWhen the user asks you to narrow homes by constraints, call set_filters with only supported left-panel filters: min_price, max_price, min_beds, min_baths, crime_risk, school_age_groups, school_radius_miles, grocery_radius_miles. school_age_groups must be an array and can include multiple values (elementary, middle, high) for multiple children. IMPORTANT: Do not ask for every filter field. Apply only what the user already provided and leave unspecified filters unchanged. If the user specifies child school age groups but omits school distance, leave school_radius_miles empty and the app will auto-apply a 1-mile default radius. If the user says grocery should be near/close but gives no distance, set grocery_radius_miles to 1. Only ask a follow-up question when the user request is ambiguous or contradictory. If user requested constraints that do not map to those fields, list them in unsupported_constraints and politely explain those cannot be auto-filtered right now.';
  }

  if (
    focusedProperty &&
    typeof focusedProperty === 'object' &&
    !Array.isArray(focusedProperty) &&
    Object.keys(focusedProperty as object).length > 0
  ) {
    base +=
      '\n\n## Currently selected listing\nThe user has this property selected on the map. When they say "this home", "this listing", "this property", or "it" (about a listing), answer using these facts:\n' +
      JSON.stringify(focusedProperty) +
      '\n\nUse only information present here. If something is not included, say you do not have that detail in the listing data.';
  }

  return base;
}

const SEARCH_LISTINGS_TOOL = {
  type: 'function' as const,
  function: {
    name: 'search_listings',
    description:
      'Search property listings in the database by optional text keywords (address, city, zip, description, home type) and numeric filters. Use when the user wants to find or compare homes.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Space-separated keywords; all words should appear somewhere in listing text (e.g. zip code, street, neighborhood name).',
        },
        min_price: { type: 'number', description: 'Minimum list price in USD' },
        max_price: { type: 'number', description: 'Maximum list price in USD' },
        min_beds: { type: 'integer', description: 'Minimum bedrooms' },
        max_beds: { type: 'integer', description: 'Maximum bedrooms' },
        limit: {
          type: 'integer',
          description:
            'Max rows in the text preview for the assistant (default 8, max 15). The app still shows all matches up to 2000 homes in the list.',
        },
      },
    },
  },
};

const SET_FILTERS_TOOL = {
  type: 'function' as const,
  function: {
    name: 'set_filters',
    description:
      'Prepare a left-panel filter patch from the user constraints. Use for guided filtering. Include unsupported_constraints if some requested conditions cannot be mapped to current filters.',
    parameters: {
      type: 'object',
      properties: {
        min_price: { type: 'number' },
        max_price: { type: 'number' },
        min_beds: { type: 'integer' },
        min_baths: { type: 'integer' },
        crime_risk: { type: 'string', enum: ['any', 'low', 'medium', 'high'] },
        school_age_groups: {
          type: 'array',
          items: { type: 'string', enum: ['elementary', 'middle', 'high'] },
        },
        school_radius_miles: { type: 'number' },
        grocery_radius_miles: { type: 'number' },
        unsupported_constraints: {
          type: 'array',
          items: { type: 'string' },
          description: 'Any requested constraints that cannot be applied by current left-panel filters.',
        },
      },
    },
  },
};

export const chatRouter = Router();

chatRouter.post('/chat', async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) {
    res.status(401).json({ error: 'OpenAI API key not configured. Set OPENAI_API_KEY in server environment.' });
    return;
  }

  const { messages: raw, focusedProperty, mode: rawMode } = req.body as {
    messages?: unknown;
    focusedProperty?: unknown;
    mode?: unknown;
  };
  if (!Array.isArray(raw)) {
    res.status(400).json({ error: 'Request body must include messages: array' });
    return;
  }

  const parsed: IncomingMessage[] = [];
  for (const m of raw) {
    if (!m || typeof m !== 'object') continue;
    const role = (m as { role?: string }).role;
    const content = (m as { content?: string }).content;
    if ((role === 'user' || role === 'assistant') && typeof content === 'string' && content.trim()) {
      parsed.push({ role, content: content.slice(0, 8000) });
    }
  }

  if (parsed.length === 0) {
    res.status(400).json({ error: 'At least one user or assistant message is required' });
    return;
  }

  const mode: ChatMode = rawMode === 'guided' ? 'guided' : 'browse';
  const latestUserText = [...parsed].reverse().find((m) => m.role === 'user')?.content ?? '';
  const systemContent = buildSystemPrompt(focusedProperty ?? null, mode);

  const recent = parsed.slice(-MAX_MESSAGES);
  let total = systemContent.length;
  const trimmed: IncomingMessage[] = [];
  for (let i = recent.length - 1; i >= 0; i--) {
    const add = recent[i].content.length + 4;
    if (total + add > MAX_TOTAL_CHARS) break;
    trimmed.unshift(recent[i]);
    total += add;
  }

  const openai = new OpenAI({ apiKey });

  let rows: GenericRow[] | null = null;
  async function getRows(): Promise<GenericRow[]> {
    if (!rows) rows = (await getPropertyPayloadsForChat()) as GenericRow[];
    return rows;
  }

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: systemContent },
    ...trimmed.map((m) => ({ role: m.role, content: m.content })),
  ];

  let searchListingsInvoked = false;
  const accumulatedListingIds: string[] = [];
  const seenIds = new Set<string>();
  let latestFilterPatch: SetFiltersArgs | undefined;
  let unsupportedConstraints: string[] | undefined;

  function appendListingIdsFromSearch(ids: string[]) {
    searchListingsInvoked = true;
    for (const id of ids) {
      if (!id || seenIds.has(id)) continue;
      seenIds.add(id);
      accumulatedListingIds.push(id);
    }
  }

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        tools: [SEARCH_LISTINGS_TOOL, SET_FILTERS_TOOL],
        tool_choice: 'auto',
        max_tokens: 1024,
      });

      const choice = completion.choices[0]?.message;
      if (!choice) {
        res.status(502).json({ error: 'Empty response from model' });
        return;
      }

      const toolCalls = choice.tool_calls;
      if (toolCalls?.length) {
        messages.push(choice);
        for (const tc of toolCalls) {
          if (tc.type !== 'function') continue;
          if (tc.function.name === 'set_filters') {
            let args: SetFiltersArgs = {};
            try {
              args = JSON.parse(tc.function.arguments || '{}') as SetFiltersArgs;
            } catch {
              args = {};
            }
            const { patch, unsupported } = normalizeFilterPatch(args);
            latestFilterPatch = patch;
            unsupportedConstraints = unsupported.length ? unsupported : undefined;
            messages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: JSON.stringify({ applied: patch, unsupported_constraints: unsupported }),
            });
            continue;
          }
          if (tc.function.name !== 'search_listings') {
            messages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: JSON.stringify({ error: 'unknown_tool' }),
            });
            continue;
          }
          let args: SearchListingsArgs = {};
          try {
            args = JSON.parse(tc.function.arguments || '{}') as SearchListingsArgs;
          } catch {
            args = {};
          }
          const data = await getRows();
          const result = searchListings(data, args);
          appendListingIdsFromSearch(result.matchingIdsForUi);
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(result.toolPayload),
          });
        }
        continue;
      }

      const text = choice.content?.trim();
      if (!text) {
        res.status(502).json({ error: 'Empty response from model' });
        return;
      }

      const payload: {
        message: string;
        listingIds?: string[];
        filterPatch?: SetFiltersArgs;
        unsupportedConstraints?: string[];
      } = { message: text };
      if (searchListingsInvoked) {
        payload.listingIds = accumulatedListingIds;
      }
      let effectiveFilterPatch = latestFilterPatch;
      if (mode === 'guided' && (!effectiveFilterPatch || Object.keys(effectiveFilterPatch).length === 0)) {
        const fallback = extractGuidedPatchFromText(latestUserText);
        if (fallback) {
          const normalized = normalizeFilterPatch(fallback);
          if (Object.keys(normalized.patch).length > 0) {
            effectiveFilterPatch = normalized.patch;
          }
        }
      }

      if (effectiveFilterPatch && Object.keys(effectiveFilterPatch).length > 0) {
        payload.filterPatch = effectiveFilterPatch;
      } else if (latestFilterPatch && Object.keys(latestFilterPatch).length > 0) {
        payload.filterPatch = latestFilterPatch;
      }
      if (unsupportedConstraints?.length) {
        payload.unsupportedConstraints = unsupportedConstraints;
      }
      res.json(payload);
      return;
    }

    res.status(502).json({ error: 'Tool loop limit exceeded' });
  } catch (e) {
    console.error('OpenAI chat error:', e);
    const msg = e instanceof Error ? e.message : 'OpenAI request failed';
    res.status(502).json({ error: msg });
  }
});
