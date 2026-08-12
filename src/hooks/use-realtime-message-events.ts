import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribes to realtime changes on public.message_events and refetches the
 * given query keys whenever a new event arrives. Also revalidates when the tab
 * regains focus or the socket reconnects, so numbers never get stale.
 */
export function useRealtimeMessageEvents(queryKeys: string[], channelName: string) {
  const queryClient = useQueryClient();
  const [live, setLive] = useState(false);
  const keys = queryKeys.join("|");

  useEffect(() => {
    const targets = keys.split("|");

    const refresh = () => {
      for (const key of targets) {
        queryClient.refetchQueries({ queryKey: [key], type: "active" });
      }
    };

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_events" },
        refresh,
      )
      .subscribe((status) => {
        const subscribed = status === "SUBSCRIBED";
        setLive(subscribed);
        if (subscribed) refresh();
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[realtime] message_events channel status:", status);
        }
      });

    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    // Keep the realtime socket authenticated across token refreshes.
    const { data: authSub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") {
        supabase.realtime.setAuth(session?.access_token ?? null);
      }
    });

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      authSub.subscription.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [queryClient, keys, channelName]);

  return live;
}
