import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Loader2, Trash2 } from 'lucide-react';
import { useChat } from '../../hooks/useChat';
import { colors, glass } from '../../design';
import type { Property } from '../../types/property';
import type { ChatFilterPatch } from '../../services/chat';

interface Props {
  focusedProperty?: Property | null;
  mode: 'browse' | 'guided';
  onboardingMode: 'pending' | 'browse' | 'guided';
  onChooseBrowse: () => void;
  onChooseGuided: () => void;
  /** Homes open in Compare view (2–4); passed to the assistant as context. */
  compareProperties?: Property[] | null;
  onChatListingResult?: (listingIds: string[] | undefined) => void;
  onFilterPatch?: (patch: ChatFilterPatch | undefined) => void;
}

export function ChatAssistant({
  focusedProperty = null,
  mode,
  onboardingMode,
  onChooseBrowse,
  onChooseGuided,
  compareProperties = null,
  onChatListingResult,
  onFilterPatch,
}: Props) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [unsupportedNotes, setUnsupportedNotes] = useState<string[] | null>(null);
  const {
    messages,
    loading,
    error,
    sendUserMessage,
    clear,
    appendAssistantMessage,
  } = useChat(
    focusedProperty,
    mode,
    onChatListingResult,
    (patch, unsupported) => {
      onFilterPatch?.(patch);
      if (unsupported?.length) setUnsupportedNotes(unsupported);
    },
    compareProperties,
  );
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (onboardingMode === 'pending') setOpen(true);
  }, [onboardingMode]);

  useEffect(() => {
    if (!unsupportedNotes?.length) return;
    appendAssistantMessage(`I can't apply these conditions with the current left filters yet: ${unsupportedNotes.join(', ')}`);
    setUnsupportedNotes(null);
  }, [unsupportedNotes, appendAssistantMessage]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open, loading]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;
    const t = input;
    setInput('');
    await sendUserMessage(t);
  }

  /** Sit above map, to the left of the 360px listings panel + gutter */
  const mapRightOffset = 'calc(360px + 1.5rem)';
  const onboardingPending = onboardingMode === 'pending';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="absolute z-[35] bottom-6 flex items-center justify-center w-12 h-12 rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95"
        style={{
          right: mapRightOffset,
          background: `linear-gradient(135deg, ${colors.cyan}30, #6366f150)`,
          border: `1px solid ${colors.cyan}50`,
          boxShadow: `0 4px 20px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.06)`,
        }}
        aria-label={open ? 'Close chat' : 'Open mortgage assistant'}
      >
        {open ? <X size={20} style={{ color: colors.cyan }} /> : <MessageCircle size={22} style={{ color: colors.cyan }} />}
      </button>

      {open && (
        <div
          className="absolute z-[35] bottom-24 flex flex-col overflow-hidden rounded-2xl shadow-2xl"
          style={{
            right: mapRightOffset,
            width: 'min(380px, calc(100vw - 360px - 3rem))',
            maxHeight: 'min(480px, 70vh)',
            ...glass.panelDense,
            borderRadius: 16,
          }}
        >
          <div
            className="flex items-center justify-between px-4 py-3 border-b"
            style={{ borderColor: colors.border }}
          >
            <div className="min-w-0">
              <p className="text-sm font-bold" style={{ color: colors.white }}>Mortgage &amp; Real Estate</p>
              <p className="text-[10px] mt-0.5 truncate" style={{ color: colors.whiteMuted }} title={focusedProperty?.address}>
                {onboardingPending
                  ? 'Welcome! Choose how you want to start.'
                  : focusedProperty
                  ? `Focused: ${focusedProperty.address}`
                  : mode === 'guided'
                    ? 'Tell me your conditions and I will apply left filters for you.'
                    : 'Ask about loans, listings search, or select a home on the map'}
              </p>
            </div>
            <button
              type="button"
              onClick={clear}
              className="p-1.5 rounded-lg transition-colors hover:bg-white/10"
              style={{ color: colors.whiteMuted }}
              title="Clear conversation"
            >
              <Trash2 size={14} />
            </button>
          </div>

          <div
            ref={listRef}
            className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-[200px] max-h-[320px]"
          >
            {onboardingPending && (
              <div
                className="text-xs leading-relaxed rounded-xl px-3 py-2 mr-auto border"
                style={{ background: colors.whiteTint, color: colors.white, borderColor: colors.border }}
              >
                Hi! I am your home-finding assistant. Would you like to browse on your own, or should I narrow listings by your conditions?
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onChooseBrowse();
                      appendAssistantMessage('Great. I will show all listings so you can browse freely.');
                    }}
                    className="px-2.5 py-1 rounded-lg text-[11px] border"
                    style={{ borderColor: `${colors.cyan}66`, color: colors.cyan, background: `${colors.cyan}18` }}
                  >
                    I will browse myself
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onChooseGuided();
                      appendAssistantMessage('Great. Tell me your budget, beds, baths, crime risk, noise level, school age groups (multi-select), school distance, and grocery distance, and I will apply them to the left filters.');
                    }}
                    className="px-2.5 py-1 rounded-lg text-[11px] border"
                    style={{ borderColor: `${colors.emerald}66`, color: '#6ee7b7', background: 'rgba(16,185,129,0.14)' }}
                  >
                    Narrow for me
                  </button>
                </div>
              </div>
            )}
            {messages.length === 0 && !loading && (
              <p className="text-xs leading-relaxed px-1" style={{ color: colors.whiteMuted }}>
                {compareProperties && compareProperties.length >= 2
                  ? 'Ask about these homes side by side (price, schools, crime risk, tradeoffs), search listings, or mortgages. What would you like to know?'
                  : mode === 'guided'
                  ? 'Share your conditions and I will auto-adjust the left filters. Example: under $700k, 3+ beds, low crime, low noise, elementary + middle school within 1 mile.'
                  : 'Ask about this listing when one is selected, search homes (e.g. “3 bed under $500k near 84106”), or mortgages and buying. What would you like to know?'}
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`text-xs leading-relaxed rounded-xl px-3 py-2 max-w-[95%] ${
                  m.role === 'user' ? 'ml-auto' : 'mr-auto'
                }`}
                style={{
                  background: m.role === 'user' ? `${colors.cyan}18` : colors.whiteTint,
                  color: colors.white,
                  border: `1px solid ${m.role === 'user' ? `${colors.cyan}35` : colors.border}`,
                }}
              >
                {m.content}
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-xs" style={{ color: colors.whiteMuted }}>
                <Loader2 size={14} className="animate-spin" />
                Thinking…
              </div>
            )}
            {error && (
              <p className="text-xs rounded-lg px-2 py-1.5" style={{ background: 'rgba(239,68,68,0.15)', color: '#fca5a5' }}>
                {error}
              </p>
            )}
          </div>

          <form onSubmit={handleSubmit} className="p-3 border-t flex gap-2" style={{ borderColor: colors.border }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a question…"
              disabled={loading || onboardingPending}
              className="flex-1 min-w-0 rounded-xl px-3 py-2 text-xs outline-none"
              style={{
                background: colors.bgPanelDense,
                border: `1px solid ${colors.border}`,
                color: colors.white,
              }}
            />
            <button
              type="submit"
              disabled={loading || !input.trim() || onboardingPending}
              className="flex-shrink-0 rounded-xl px-3 py-2 disabled:opacity-40"
              style={{ background: colors.cyan + '25', color: colors.cyan, border: `1px solid ${colors.cyan}40` }}
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
