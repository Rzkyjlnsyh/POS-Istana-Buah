/**
 * Error aplikasi standar (Bagian 17.2). Selalu gunakan class ini untuk error bisnis/HTTP.
 * `code` = kode mesin (mis. INSUFFICIENT_STOCK, ACCOUNT_LOCKED).
 */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
