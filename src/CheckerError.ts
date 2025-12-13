/**
 * Represents an error that occurred during the execution of the dependency checker.
 */
export class CheckerError extends Error {
  /**
   * Constructs a new CheckerError instance.
   *
   * @param {string} message - the error message to display.
   * @param {unknown} [originalError] - the original error that triggered this CheckerError.
   *                                    If provided, the original error will be exposed as a public property on the
   *                                    CheckerError instance.
   */
  constructor(message: string, public readonly originalError?: unknown) {
    super(message);
    this.name = 'CheckerError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}