"use client";

import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { getQueryKey } from "@trpc/react-query";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { trpc } from "./trpc";
import { createApiClient } from "./trpc-provider";

export function principalKey(user: {
  id: string;
  organizationId: string;
  role: string;
  employeeId?: string | null;
}) {
  // Non-secret freshness metadata, not a credential or authorization claim.
  return JSON.stringify([
    user.id,
    user.organizationId,
    user.role,
    user.employeeId ?? null,
  ]);
}

export function PrincipalQueryProvider({
  scope,
  children,
}: {
  scope: string;
  children: ReactNode;
}) {
  return (
    <PrincipalCache key={scope} scope={scope}>
      {children}
    </PrincipalCache>
  );
}

function PrincipalCache({
  scope,
  children,
}: {
  scope: string;
  children: ReactNode;
}) {
  const authClient = useQueryClient();
  const active = useRef(true);
  const [queryClient] = useState(() => {
    const recheckSession = (error: unknown) => {
      if (
        active.current &&
        error instanceof TRPCClientError &&
        error.data?.code === "UNAUTHORIZED"
      ) {
        void authClient.invalidateQueries({
          queryKey: getQueryKey(trpc.auth.me, undefined, "query"),
        });
      }
    };
    return new QueryClient({
      queryCache: new QueryCache({ onError: recheckSession }),
      mutationCache: new MutationCache({ onError: recheckSession }),
      defaultOptions: { mutations: { retry: false } },
    });
  });
  const [client] = useState(() => createApiClient(scope));
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      // In-flight writes may already have committed server-side. Dispose
      // their local state; never retry them under a different principal.
      void queryClient.cancelQueries();
      queryClient.clear();
    };
  }, [queryClient]);
  return (
    <trpc.Provider client={client} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
