export type ChatMessageRole = 'user' | 'assistant';

export interface ChatMessage {
  role: ChatMessageRole;
  content: string;
}

export interface ChatResponse {
  message: string;
}

export async function postChat(messages: ChatMessage[]): Promise<string> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });
  const data = (await res.json()) as ChatResponse & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `Chat request failed (${res.status})`);
  }
  if (!data.message) {
    throw new Error('No message in response');
  }
  return data.message;
}
