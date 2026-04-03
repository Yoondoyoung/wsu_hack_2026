import { useState, useCallback } from 'react';
import { postChat, type ChatMessage } from '../services/chat';
import type { Property } from '../types/property';

export function useChat(
  focusedProperty: Property | null,
  onChatListingResult?: (listingIds: string[] | undefined) => void,
  compareProperties?: Property[] | null,
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendUserMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: trimmed };
    setError(null);
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const history = [...messages, userMsg];
      const reply = await postChat(history, { focusedProperty, compareProperties });
      setMessages((prev) => [...prev, { role: 'assistant', content: reply.message }]);
      onChatListingResult?.(reply.listingIds);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong';
      setError(msg);
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  }, [messages, loading, focusedProperty, compareProperties, onChatListingResult]);

  const clear = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return { messages, loading, error, sendUserMessage, clear };
}
