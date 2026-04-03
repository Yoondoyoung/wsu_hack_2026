import { useState, useCallback } from 'react';
import {
  postChat,
  type ChatMessage,
  type ChatFilterPatch,
  type FocusedAnalysisContext,
} from '../services/chat';
import type { Property } from '../types/property';

export function useChat(
  focusedProperty: Property | null,
  focusedAnalysis: FocusedAnalysisContext | null,
  mode: 'browse' | 'guided',
  onChatListingResult?: (listingIds: string[] | undefined) => void,
  onFilterPatch?: (patch: ChatFilterPatch | undefined, unsupported: string[] | undefined) => void,
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
      const reply = await postChat(history, { focusedProperty, focusedAnalysis, mode, compareProperties });
      setMessages((prev) => [...prev, { role: 'assistant', content: reply.message }]);
      onChatListingResult?.(reply.listingIds);
      onFilterPatch?.(reply.filterPatch, reply.unsupportedConstraints);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong';
      setError(msg);
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  }, [messages, loading, focusedProperty, focusedAnalysis, mode, compareProperties, onChatListingResult, onFilterPatch]);

  const appendAssistantMessage = useCallback((content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;
    setMessages((prev) => [...prev, { role: 'assistant', content: trimmed }]);
  }, []);

  const clear = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return { messages, loading, error, sendUserMessage, clear, appendAssistantMessage };
}
