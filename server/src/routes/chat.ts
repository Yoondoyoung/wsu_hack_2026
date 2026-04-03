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
  /**
   * Worst acceptable crime tier (from listing payload `crimeRiskLevel`, computed vs regional data at ingest).
   * low = only low; medium = low+medium; high = no extra crime filter.
   */
  max_crime_risk_tier?: 'low' | 'medium' | 'high';
}

const CRIME_TIER_ORDER: Record<string, number> = { low: 0, medium: 1, high: 2 };

function crimeRiskTierOrder(row: GenericRow): number | null {
  const raw = str(row, 'crimeRiskLevel').toLowerCase();
  if (raw in CRIME_TIER_ORDER) return CRIME_TIER_ORDER[raw]!;
  return null;
}

function matchesMaxCrimeRiskTier(row: GenericRow, maxTier: 'low' | 'medium' | 'high'): boolean {
  const propOrder = crimeRiskTierOrder(row);
  if (propOrder === null) return false;
  return propOrder <= CRIME_TIER_ORDER[maxTier]!;
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
    if (
      args.max_crime_risk_tier === 'low' ||
      args.max_crime_risk_tier === 'medium'
    ) {
      if (!matchesMaxCrimeRiskTier(row, args.max_crime_risk_tier)) return false;
    }
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
    crimeRiskLevel: str(row, 'crimeRiskLevel') || undefined,
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

function buildSystemPrompt(focusedProperty: unknown, compareProperties: unknown): string {
  let base =
    CHAT_SYSTEM_PROMPT +
    '\n\nYou can call the search_listings tool to find real homes from the app’s Salt Lake area listing database. Each listing includes a precomputed crimeRiskLevel (low/medium/high) from regional incident data—use parameter max_crime_risk_tier: low when the user wants the lowest tier only; medium to allow low and medium. When the user asks for safe areas or low crime, call search_listings with max_crime_risk_tier rather than giving only generic neighborhood advice. When the user asks for homes matching price, beds, or location keywords, use the tool. Describe only listings returned by the tool; do not invent addresses or prices.' +
    '\n\nAfter search_listings returns results: the app shows those homes in the right-hand list and on the map (properties_shown_in_app matches what the user sees; use total_matched for how many fit the search). If ids_truncated is true, say the app shows the first N matches of a larger set. Keep your chat reply short (2–4 sentences). Briefly confirm the criteria you used, state roughly how many matches there were (use total_matched from the tool if helpful), and say the matches are shown in the list—do not enumerate addresses, prices, or bed counts in the chat. If there are zero matches, say so in one or two sentences and suggest relaxing filters. Match the user’s language (e.g. Korean if they wrote in Korean).' +
    '\n\nFor mortgage or general questions that do not require search_listings, answer as usual with appropriate detail.';

  const compareList =
    Array.isArray(compareProperties) && compareProperties.length > 0
      ? compareProperties.filter((x) => x && typeof x === 'object')
      : [];

  if (compareList.length >= 2) {
    base +=
      '\n\n## Compare view (side-by-side)\nThe user has these listings open in the Compare view. Use this data for questions about differences, tradeoffs, "which is better", price, beds, schools, crime risk, or choosing between these homes. Refer to them by address or short labels (e.g. first vs second column order as listed).\n' +
      JSON.stringify(compareList) +
      '\n\nUse only facts from this JSON. If the Compare view is present, prefer it for compare-or-choose questions over the single selected listing below.';
  }

  if (
    focusedProperty &&
    typeof focusedProperty === 'object' &&
    !Array.isArray(focusedProperty) &&
    Object.keys(focusedProperty as object).length > 0
  ) {
    base +=
      '\n\n## Map-selected listing\nThe user may have this property selected on the map. When they say "this home", "this listing", or "it" (about one listing) and Compare view is not the topic, answer using these facts:\n' +
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
      'Search property listings in the database by optional text keywords (address, city, zip, description, home type), numeric filters, and optional max_crime_risk_tier (listing crimeRiskLevel is stored per home). Use when the user wants to find or compare homes, including low-crime or safety preferences.',
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
        max_crime_risk_tier: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description:
            'Optional. Filters by each listing\'s crimeRiskLevel (low/medium/high), precomputed in the database. Use low when the user wants the lowest reported crime tier only; medium to include low and medium; omit or use high for no crime-tier filter.',
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

  const { messages: raw, focusedProperty, compareProperties } = req.body as {
    messages?: unknown;
    focusedProperty?: unknown;
    compareProperties?: unknown;
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

  const systemContent = buildSystemPrompt(focusedProperty ?? null, compareProperties ?? null);

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
        tools: [SEARCH_LISTINGS_TOOL],
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

      const payload: { message: string; listingIds?: string[] } = { message: text };
      if (searchListingsInvoked) {
        payload.listingIds = accumulatedListingIds;
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
