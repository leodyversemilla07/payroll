import { Injectable } from "@nestjs/common";
import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";

export interface Context {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

@Injectable()
export class TrpcService {
  public readonly trpc = initTRPC.context<Context>().create({
    transformer: superjson,
  });

  public readonly router = this.trpc.router;
  public readonly procedure = this.trpc.procedure;
  public readonly middleware = this.trpc.middleware;
}
