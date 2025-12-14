import type * as originalCore from '@actions/core';
import type { MockInstance } from 'vitest';


/**
 * The arguments that each method in `core` can accept.
 */
type CoreMethodArgs = {
  debug: [message: string];
  notice: [message: string];
  info: [message: string];
  warning: [message: string];
  error: [message: string];
  setOutput: [name: string, value: unknown];
  setFailed: [message: string];
  startGroup: [name: string];
  endGroup: [];
};


/**
 * The mocked methods in `core`.
 */
type CoreMocks = {
  [K in keyof CoreMethodArgs]: MockInstance<(...args: CoreMethodArgs[K]) => void>;
} & {
  mockReset: () => void;
};

/**
 * Creates a mock method for the given method name of `core`.
 *
 * @template M - The name of the method in `core`.
 * @param {M} method - The name of the method in `core`.
 * @param {(method: M, ...args: CoreMethodArgs[M]) => void} newCoreBehavior - The new behavior for the method.
 * @returns {MockInstance<(...args: CoreMethodArgs[M]) => void>} - The mocked method.
 */
const createMockMethod = <M extends keyof CoreMethodArgs>(
  method: M,
  newCoreBehavior: (method: M, ...args: CoreMethodArgs[M]) => void
): MockInstance<(...args: CoreMethodArgs[M]) => void> => {
  return vi.fn((...args: CoreMethodArgs[M]) => newCoreBehavior(method, ...args));
};


/**
 * Creates a mock of the entire `@actions/core` module.
 *
 * @param {typeof originalCore} actualCore - The actual `@actions/core` module.
 * @returns {CoreMocks} - The mocked methods from `@actions/core`.
 */
export const createMockCore = (actualCore: typeof originalCore): CoreMocks => {
  const mocks: CoreMocks = {} as CoreMocks;

  const newCoreBehavior = <M extends keyof CoreMethodArgs>(method: M, ...args: CoreMethodArgs[M]): void => {
    if (process.env.ACTIONS_STEP_DEBUG === 'true') {
      const coreMethod = actualCore[method] as (...args: CoreMethodArgs[M]) => void;
      coreMethod(...args);
      return;
    }

    return undefined;
  };

  // Create mocks.
  mocks.setOutput = vi.fn();
  mocks.debug = createMockMethod('debug', newCoreBehavior);
  mocks.notice = createMockMethod('notice', newCoreBehavior);
  mocks.info = createMockMethod('info', newCoreBehavior);
  mocks.warning = createMockMethod('warning', newCoreBehavior);
  mocks.error = createMockMethod('error', newCoreBehavior);
  mocks.setFailed = createMockMethod('setFailed', newCoreBehavior);
  mocks.startGroup = createMockMethod('startGroup', newCoreBehavior);
  mocks.endGroup = createMockMethod('endGroup', newCoreBehavior);

  /**
   * Resets all the mocked methods.
   *
   * @returns {void}
   */
  mocks.mockReset = (): void => {
    Object.values(mocks).forEach((mock) => {
      if (mock && typeof mock === 'object' && 'mockReset' in mock) {
        mock.mockReset();
      }
    });
  };

  return {
    ...actualCore,
    ...mocks,
  };
};