import { queryOptions } from "@tanstack/react-query";
import { getMyProfile } from "@/lib/profiles.functions";

export const sessionProfileQuery = queryOptions({
  queryKey: ["session-profile"],
  queryFn: () => getMyProfile({ data: undefined }),
  staleTime: 60_000,
});
