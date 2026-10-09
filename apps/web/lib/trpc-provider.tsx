"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { useState } from "react";
import superjson from "superjson";
import { trpc } from "./trpc";

export function createApiClient(expectedPrincipal?: string) {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/trpc",
        transformer: superjson,
        headers: expectedPrincipal
          ? { "x-payroll-principal": expectedPrincipal }
          : {},
        fetch(url, options) {
          return fetch(url, { ...options, credentials: "include" });
        },
      }),
    ],
  });
}

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  // This root cache owns authentication only. Workspace business data has a
  // separately disposable cache scoped to the verified principal.
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() => createApiClient());

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
