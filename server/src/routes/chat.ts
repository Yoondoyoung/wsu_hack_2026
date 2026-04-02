import { Router } from 'express';
import OpenAI from 'openai';

export const CHAT_SYSTEM_PROMPT =
  'You are a mortgage expert and a real estate expert. Help users by answering their questions about mortgages, real estate, home buying, and closely related financial topics. If a question is outside this scope, politely decline: you cannot answer questions that are outside your area of expertise.';

const MAX_MESSAGES = 24;
const MAX_TOTAL_CHARS = 12000;

type ChatRole = 'user' | 'assistant';

interface IncomingMessage {
  role: ChatRole;
  content: string;
}

export const chatRouter = Router();

chatRouter.post('/chat', async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) {
    res.status(401).json({ error: 'OpenAI API key not configured. Set OPENAI_API_KEY in server environment.' });
    return;
  }

  const { messages: raw } = req.body as { messages?: unknown };
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

  const recent = parsed.slice(-MAX_MESSAGES);
  let total = CHAT_SYSTEM_PROMPT.length;
  const trimmed: IncomingMessage[] = [];
  for (let i = recent.length - 1; i >= 0; i--) {
    const add = recent[i].content.length + 4;
    if (total + add > MAX_TOTAL_CHARS) break;
    trimmed.unshift(recent[i]);
    total += add;
  }

  const openai = new OpenAI({ apiKey });

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: CHAT_SYSTEM_PROMPT },
        ...trimmed.map((m) => ({ role: m.role, content: m.content })),
      ],
      max_tokens: 1024,
    });

    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) {
      res.status(502).json({ error: 'Empty response from model' });
      return;
    }

    res.json({ message: text });
  } catch (e) {
    console.error('OpenAI chat error:', e);
    const msg = e instanceof Error ? e.message : 'OpenAI request failed';
    res.status(502).json({ error: msg });
  }
});
