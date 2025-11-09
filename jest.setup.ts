if (!process.env.GITHUB_ACTIONS) {
  process.env.SERVER_URL ||= 'https://github.com';
  process.env.GITHUB_API_URL ||= 'https://api.github.com';
  process.env.GITHUB_TOKEN ||= 'test_token';
}

import * as core from '@actions/core';

const originalDebug = core.debug;
jest.spyOn(core, 'debug').mockImplementation((message: string) => {
  if (process.env.DEBUG_TEST === 'true') {
    return originalDebug(message);
  }
});
