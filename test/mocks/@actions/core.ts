import type * as originalCore from '@actions/core'; // Import only types

/**
 * Creates a mock version of the @actions/core module, overriding the debug behavior to only write to the console when
 * the DEBUG_TEST environment variable is set to 'true'.
 *
 * @param {typeof originalCore} actualCore - The actual @actions/core module object.
 * @returns {typeof originalCore} A mock version of the @actions/core module.
 */
export const createMockCore = (actualCore: typeof originalCore): typeof originalCore => {
  /**
   * Overridden debug behavior for testing purposes.
   *
   * When the DEBUG_TEST environment variable is set to 'true', this function will pass the message to the actual
   * `@actions/core` module's debug function. Otherwise, it will simply return undefined.
   *
   * NOTE: You must also handle any vi.fn() or vi.spyOn() calls used for assertions by defining them here and passing
   * them through or exposing them separately.
   *
   * @param {string} message - The message to log (or not).
   * @returns {void | undefined} The result of calling the actual debug function, or undefined if DEBUG_TEST is not 'true'.
   */
  const newDebugBehavior = (message: string): void | undefined => {
    if (process.env.DEBUG_TEST === 'true') {
      return actualCore.debug(message);
    }
    return undefined;
  };

  // Return the new module definition: all originals + the override above.
  return {
    ...actualCore,
    debug: newDebugBehavior as typeof actualCore.debug,
  } as typeof originalCore;
};
