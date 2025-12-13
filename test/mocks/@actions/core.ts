import type * as originalCore from '@actions/core';
import type { MockInstance } from 'vitest';

type CoreMocks = {
  [K in keyof (typeof originalCore & { mockReset: () => void })]?:
  K extends 'mockReset' ? () => void : MockInstance;
};

export const createMockCore = (actualCore: typeof originalCore) => {
  const mocks: CoreMocks = {};

  const newCoreBehavior = (message: string): void => {
    if (process.env.ACTIONS_STEP_DEBUG === 'true') {
      return actualCore.debug(message);
    }
    return undefined;
  };

  // Create mock functions
  mocks.setOutput = vi.fn();
  mocks.debug = vi.fn(newCoreBehavior);
  mocks.notice = vi.fn(newCoreBehavior);
  mocks.info = vi.fn(newCoreBehavior);
  mocks.warning = vi.fn(newCoreBehavior);
  mocks.error = vi.fn(newCoreBehavior);
  mocks.setFailed = vi.fn(newCoreBehavior);

  // Add reset function
  mocks.mockReset = () => {
    Object.values(mocks).forEach(mock => {
      if (mock && typeof mock === 'object' && 'mockReset' in mock) {
        mock.mockReset();
      }
    });
  };

  return {
    ...actualCore,
    ...mocks,
  } as unknown as typeof originalCore & { mockReset: () => void };
};