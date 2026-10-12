import { Injectable } from '@nestjs/common';

// Version is read at runtime so the build tsconfig needs no
// resolveJsonModule (which would pull package.json into the program and
// shift tsc's inferred rootDir, breaking the dist layout).
const { version } = require('../package.json') as { version: string };

export interface ApiInfo {
  name: string;
  version: string;
  status: 'ok';
  timestamp: string;
  endpoints: {
    trpc: string;
  };
}

@Injectable()
export class AppService {
  /**
   * Root metadata for humans, uptime monitors, and deploy verification
   * ("which build is answering?"). Deliberately cheap and dependency-free:
   * no database or downstream calls, so it stays up when dependencies are
   * down. Deep procedure health lives behind the tRPC `health` query.
   */
  getInfo(): ApiInfo {
    return {
      name: 'payroll-api',
      version,
      status: 'ok',
      timestamp: new Date().toISOString(),
      endpoints: {
        trpc: '/trpc',
      },
    };
  }
}
