import { VercelRequest, VercelResponse } from '@vercel/node';
import session from 'express-session';
import memoryStore from 'memorystore';

const MemoryStore = memoryStore(session);

// Reuse the same session middleware setup from index.ts
export const sessionMiddleware = session({
  secret: 'secret123',
  saveUninitialized: true,
  resave: false,
  cookie: {
    maxAge: 86400000,
    httpOnly: true,
  },
  store: new MemoryStore({
    checkPeriod: 86400000, // prune expired entries every 24h
  }),
});

// Wrapper to make express middleware work with Vercel handlers
export function withSession(handler: (req: VercelRequest, res: VercelResponse) => Promise<void>) {
  return async (req: VercelRequest, res: VercelResponse) => {
    await new Promise((resolve, reject) => {
      sessionMiddleware(req as any, res as any, (err?: any) => {
        if (err) reject(err);
        else resolve(undefined);
      });
    });
    return handler(req, res);
  };
}