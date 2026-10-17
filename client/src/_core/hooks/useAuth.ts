import { trpc } from "@/lib/trpc";
import { cloudMode, useCloudSession } from "@/lib/neonAuth";
import { isGuestMode } from "@/lib/guestLibrary";

export function useAuth() {
  const session = useCloudSession();
  const guest = cloudMode && isGuestMode();
  const canQuery = !cloudMode || guest || (!session.isPending && Boolean(session.data?.user));
  const meQuery = trpc.auth.me.useQuery(undefined, {
    enabled: canQuery,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const user = canQuery ? meQuery.data ?? null : null;
  return {
    user,
    loading: (cloudMode && !guest && session.isPending) || (canQuery && meQuery.isLoading),
    error: (cloudMode && !guest ? session.error : null) ?? (canQuery ? meQuery.error : null) ?? null,
    isAuthenticated: Boolean(user),
    refresh: () => meQuery.refetch(),
  };
}
