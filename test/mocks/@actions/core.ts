import type * as originalCore from '@actions/core';

/**
 * Creates a mock version of the @actions/core module, overriding the debug behavior to only write to the console when
 * the ACTIONS_STEP_DEBUG environment variable is set to 'true'.
 *
 * @param {typeof originalCore} actualCore - The actual @actions/core module object.
 * @returns {typeof originalCore} A mock version of the @actions/core module.
 */
export const createMockCore = (actualCore: typeof originalCore): typeof originalCore => {
  /**
   * Overridden debug behavior for testing purposes.
   *
   * When the ACTIONS_STEP_DEBUG environment variable is set to 'true', this function will pass the message to the actual
   * `@actions/core` module's debug function. Otherwise, it will simply return undefined.
   *
   * NOTE: You must also handle any vi.fn() or vi.spyOn() calls used for assertions by defining them here and passing
   * them through or exposing them separately.
   *
   * @param {string} message - The message to log (or not).
   * @returns {void | undefined} The result of calling the actual debug function, or undefined if ACTIONS_STEP_DEBUG is not 'true'.
   */
  const newDebugBehavior = (message: string): void | undefined => {
    if (process.env.ACTIONS_STEP_DEBUG === 'true') {
      return actualCore.debug(message);
    }
    return undefined;
  };

  // Return the new module definition: all originals + the override above.
  return {
    ...actualCore,
    debug: newDebugBehavior as typeof actualCore.debug,
    notice: vi.fn(message => console.log(message)),
    info: vi.fn(message => console.log(message)), //TODO: Remove these 4
    warning: vi.fn(message => console.warn(message)),
    error: vi.fn(message => console.error(message)),
    setFailed: vi.fn(message => console.log(message)),
    setOutput: vi.fn(),
  } as typeof originalCore;
};
