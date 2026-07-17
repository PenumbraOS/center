import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { usePin } from "../../hooks";
import type { ConversationDetail, ConversationMessage } from "../../api";
import { logError } from "../../logging";

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

function MessageBubble({
  role,
  content,
}: {
  role: string;
  content: string;
}) {
  const roleClass =
    role === "user" ? "conv-msg conv-msg--user" :
    role === "system" ? "conv-msg conv-msg--system" :
    "conv-msg conv-msg--assistant";

  const roleLabel =
    role === "user" ? "You" :
    role === "system" ? "System" :
    "Pin";

  return (
    <div className={roleClass}>
      <span className="conv-msg__label">{roleLabel}</span>
      <div className="conv-msg__body">
        {content.split("\n").map((line, i) => (
          <span key={i}>
            {line}
            {i < content.split("\n").length - 1 && <br />}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function ConversationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { client } = usePin();
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSystem, setShowSystem] = useState(false);

  useEffect(() => {
    if (!client || !id) return;

    let cancelled = false;
    client.getConversation(Number(id))
      .then((result) => {
        if (!cancelled) {
          setDetail(result);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          logError("ConversationDetailPage", "Failed to load conversation", err, { id });
          setError(err instanceof Error ? err.message : "Failed to load conversation");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [client, id]);

  const messages: ConversationMessage[] = detail?.messages ?? [];
  const visibleMessages = showSystem
    ? messages
    : messages.filter((m: ConversationMessage) => m.role !== "system");
  const hasSystemMessages = messages.some((m: ConversationMessage) => m.role === "system");
  const systemCount = messages.filter((m: ConversationMessage) => m.role === "system").length;

  if (loading) {
    return (
      <>
        <section className="app-page-header">
          <div className="container">
            <Link to="/conversations" className="back-link">← Back to Conversations</Link>
            <div className="app-loading-state">
              <p>Loading conversation...</p>
            </div>
          </div>
        </section>
      </>
    );
  }

  if (error || !detail) {
    return (
      <>
        <section className="app-page-header">
          <div className="container">
            <Link to="/conversations" className="back-link">← Back to Conversations</Link>
            <div className="app-empty-state">
              <p className="app-empty-state__title">Conversation not found</p>
              <p>{error ?? "This conversation may have been deleted."}</p>
            </div>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <section className="app-page-header">
        <div className="container">
          <Link to="/conversations" className="back-link">← Back to Conversations</Link>
          <div className="app-page-intro">
            <h1 className="app-page-title">{detail.utterance}</h1>
            <p className="app-page-copy">
              {formatTimeAgo(detail.created_at)}
              {detail.is_vision && <span className="conv-vision-tag"> Vision</span>}
            </p>
          </div>
        </div>
      </section>

      <section className="app-page-content conv-detail">
        <div className="container">
          <div className="conv-thread">
            {visibleMessages.map((msg) => (
              <MessageBubble key={msg.seq} role={msg.role} content={msg.content} />
            ))}

            {visibleMessages.length === 0 && (
              <div className="app-empty-state">
                <p>No messages in this conversation.</p>
              </div>
            )}
          </div>

          {hasSystemMessages && !showSystem && (
            <button
              className="conv-system-toggle"
              onClick={() => setShowSystem(true)}
            >
              Show {systemCount} system message{systemCount > 1 ? "s" : ""}
            </button>
          )}

          {showSystem && hasSystemMessages && (
            <button
              className="conv-system-toggle"
              onClick={() => setShowSystem(false)}
            >
              Hide system messages
            </button>
          )}
        </div>
      </section>
    </>
  );
}