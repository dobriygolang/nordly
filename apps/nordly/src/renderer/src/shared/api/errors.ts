export class ApiHttpError extends Error {
  readonly operation: string;
  readonly status: number;

  constructor(operation: string, status: number) {
    super(`${operation}: ${status}`);
    this.name = 'ApiHttpError';
    this.operation = operation;
    this.status = status;
  }
}

export function isApiHttpError(
  error: unknown,
  status?: number,
): error is ApiHttpError {
  return (
    error instanceof ApiHttpError &&
    (status === undefined || error.status === status)
  );
}

export function requireOk(response: Response, operation: string): void {
  if (!response.ok) throw new ApiHttpError(operation, response.status);
}
