import { useCallback, useEffect, useRef, useState } from "react";
import type { ConversationSummary } from "../api";
import { usePin } from "./pinContext";
import { logError, logInfo } from "../logging";

const PAGE_SIZE = 50;

interface UseConversationsResult {
  /** All conversations loaded so far. */
  conversations: ConversationSummary[];
  /** Whether the initial page has been fetched. */
  loaded: boolean;
  /** Whether a background page load is in progress. */
  loadingMore: boolean;
  /** Whether there are more conversations to load. */
  hasMore: boolean;
  /**
   * Ref callback for the sentinel element at the bottom of the list.
   * Wire this to `ref` on a sentinel <div> to trigger infinite scroll.
   */
  sentinelRef: (node: HTMLDivElement | null) => void;
}

export function useConversations(): UseConversationsResult {
  const { client } = usePin();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const offsetRef = useRef(0);
  const loadingRef = useRef(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const fetchPage = useCallback(
    async (offset: number) => {
      if (!client || loadingRef.current) return;
      loadingRef.current = true;
      setLoadingMore(true);

      try {
        const result = await client.listConversations(offset, PAGE_SIZE);
        setConversations((prev) => {
          if (offset === 0) return result.conversations;
          return [...prev, ...result.conversations];
        });
        setHasMore(result.has_more);
        offsetRef.current = offset + result.conversations.length;
        logInfo("useConversations", "Loaded conversation page", {
          offset,
          count: result.conversations.length,
          hasMore: result.has_more,
        });
      } catch (error) {
        logError("useConversations", "Failed to load conversations", error, { offset });
      } finally {
        loadingRef.current = false;
        setLoadingMore(false);
        setLoaded(true);
      }
    },
    [client],
  );

  // Initial load
  useEffect(() => {
    if (!client) return;
    offsetRef.current = 0;
    setConversations([]);
    setLoaded(false);
    setHasMore(true);
    fetchPage(0);
  }, [client, fetchPage]);

  // Stable loadMore that always uses the latest offset ref
  const loadMoreRef = useRef<() => void>(() => {});
  loadMoreRef.current = useCallback(() => {
    if (!hasMore || loadingRef.current) return;
    fetchPage(offsetRef.current);
  }, [hasMore, fetchPage]);

  // Create IntersectionObserver — observes the sentinel element
  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMoreRef.current();
        }
      },
      { rootMargin: "200px" },
    );
    return () => {
      observerRef.current?.disconnect();
    };
  }, []);

  // Callback ref for the sentinel element
  const sentinelRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    observerRef.current?.observe(node);
    return () => {
      observerRef.current?.unobserve(node);
    };
  }, []);

  return {
    conversations,
    loaded,
    loadingMore,
    hasMore,
    sentinelRef,
  };
}