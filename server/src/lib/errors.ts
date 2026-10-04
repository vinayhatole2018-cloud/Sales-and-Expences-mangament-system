export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(400, message, details);
export const unauthorized = (message = 'Please sign in to continue.') => new AppError(401, message);
export const forbidden = (message = 'You do not have permission to access this record.') => new AppError(403, message);
export const notFound = (what = 'Record') => new AppError(404, `${what} not found.`);
export const conflict = (message: string) => new AppError(409, message);
