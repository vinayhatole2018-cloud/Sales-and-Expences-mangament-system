import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import multer from 'multer';
import { AppError } from '../lib/errors';

function humanPath(path: (string | number)[]): string {
  const last = [...path].reverse().find((p) => typeof p === 'string') as string | undefined;
  if (!last) return '';
  return last.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    const issue = err.issues[0];
    const field = humanPath(issue.path);
    const generic = issue.message === 'Required' || issue.message.startsWith('Expected') || issue.message.startsWith('Invalid');
    const message = generic && field ? `${field}: ${issue.message === 'Required' ? 'this field is required' : issue.message.toLowerCase()}.` : issue.message;
    return res.status(400).json({ error: message, issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
  }
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large. Maximum size is 10 MB.' : `Upload failed: ${err.message}`;
    return res.status(400).json({ error: message });
  }
  // Firestore transaction contention or unexpected failures.
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`, err);
  res.status(500).json({ error: 'Something went wrong on the server. Please try again.' });
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: 'Endpoint not found.' });
}
