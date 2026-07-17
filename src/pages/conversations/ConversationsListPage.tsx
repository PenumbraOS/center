import { Link } from "react-router-dom";
import { useConversations } from "../../hooks";

function formatTimeAgo(created_at: string): string {
  const now = Date.now();
  const created = Number(created_at) * 1000;
  const diff = now - created;

  if (diff < 0) return "just now";
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) {
    const mins = Math.floor(diff / 60_000);
    return `${mins}m ago`;
  }
  if (diff < 86_400_000) {
    const hours = Math.floor(diff / 3_600_000);
    return `${hours}h ago`;
  }
  if (diff < 604_800_000) {
    const days = Math.floor(diff / 86_400_000);
    return `${days}d ago`;
  }

  const date = new Date(created);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
}

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}

function ConversationRow({ conversation }: { conversation: { id: number; utterance: string; created_at: string; is_vision: boolean } }) {
  return (
    <Link to={`/conversations/${conversation.id}`} className="conv-row">
      <div className="conv-row__content">
        <p className="conv-row__utterance">
          {truncate(conversation.utterance, 120)}
        </p>
        <span className="conv-row__meta">
          {conversation.is_vision && <span className="conv-row__vision-badge">Vision</span>}
          <time className="conv-row__time">{formatTimeAgo(conversation.created_at)}</time>
        </span>
      </div>
    </Link>
  );
}

export default function ConversationsListPage() {
  const { conversations, loaded, loadingMore, hasMore, sentinelRef } =
    useConversations();

  return (
    <>
      <section className="app-page-header">
        <div className="container">
          <div className="app-page-intro">
            <h1 className="app-page-title">Conversations</h1>
            <p className="app-page-copy">
              Browse past conversations with your Pin. Tap a conversation to view the full exchange.
            </p>
          </div>
        </div>
      </section>

      <section className="app-page-content conversations-list">
        <div className="container">
          {!loaded && (
            <div className="app-loading-state">
              <p>Loading conversations...</p>
            </div>
          )}

          {loaded && conversations.length === 0 && (
            <div className="app-empty-state">
              <p className="app-empty-state__title">No conversations yet</p>
              <p>Ask your Pin a question to get started.</p>
            </div>
          )}

          {conversations.length > 0 && (
            <div className="conv-list">
              {conversations.map((conv) => (
                <ConversationRow key={conv.id} conversation={conv} />
              ))}

              {/* Sentinel element for infinite scroll */}
              <div
                ref={sentinelRef}
                className="conv-sentinel"
                aria-hidden={!loadingMore}
              >
                {loadingMore && (
                  <div className="conv-loading">
                    <span>Loading more...</span>
                  </div>
                )}
                {!hasMore && conversations.length > 0 && (
                  <div className="conv-end">
                    <span>End of conversations</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}