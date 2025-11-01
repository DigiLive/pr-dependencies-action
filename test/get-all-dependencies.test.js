const { test, expect, describe } = require('@jest/globals');
const evaluate = require('../src/pr-dependency-parser.js');

process.env.GITHUB_REPOSITORY = 'owner/repo';

describe('getAllDependencies', () => {
    describe('shorthand format', () => {
        test('should parse shorthand dependency', () => {
            const input = 'Depends on #14';
            expect(evaluate.getAllDependencies(input)).toStrictEqual([{
                owner: 'owner',
                repo: 'repo',
                pull_number: 14
            }]);
        });
    });

    describe('partial link format', () => {
        test('should parse partial link dependency', () => {
            const input = 'Depends on username/dependencies-action#5';
            expect(evaluate.getAllDependencies(input)).toStrictEqual([{
                owner: 'username',
                repo: 'dependencies-action',
                pull_number: 5
            }]);
        });
    });

    describe('multiple dependencies', () => {
        test('should handle multiple dependencies in different formats', () => {
            const input = `Depends on #14
Depends on username/dependencies-action#5`;
            expect(evaluate.getAllDependencies(input)).toStrictEqual([
                {
                    owner: 'owner',
                    repo: 'repo',
                    pull_number: 14
                },
                {
                    owner: 'username',
                    repo: 'dependencies-action',
                    pull_number: 5
                }
            ]);
        });
    });

    describe('whitespace handling', () => {
        test('should handle a blank line at the end', () => {
            const input = `Depends on #14
Depends on username/dependencies-action#5

`;
            expect(evaluate.getAllDependencies(input)).toStrictEqual([
                {
                    owner: 'owner',
                    repo: 'repo',
                    pull_number: 14
                },
                {
                    owner: 'username',
                    repo: 'dependencies-action',
                    pull_number: 5
                }
            ]);
        });

        test('should handle a blank line in the middle', () => {
            const input = `Depends on #14

Depends on username/dependencies-action#5`;
            expect(evaluate.getAllDependencies(input)).toStrictEqual([
                {
                    owner: 'owner',
                    repo: 'repo',
                    pull_number: 14
                },
                {
                    owner: 'username',
                    repo: 'dependencies-action',
                    pull_number: 5
                }
            ]);
        });
    });

    describe('complex cases', () => {
        test('should handle multiple dependencies in a bulleted list with mixed formats', () => {
            const input = `- Blocked by: https://github.com/username/action_docker/pull/1
- Blocked by: https://github.com/username/action_bump/pull/1
- Blocked By https://github.com/username/action_python/pull/1
- Blocked By: https://github.com/username/action_pull_requests/pull/1
- Related: https://github.com/username/dependencies-action/issues/28
- Related: #213 
- Related: #214 `;

            expect(evaluate.getAllDependencies(input)).toStrictEqual([
                {
                    owner: 'username',
                    repo: 'action_docker',
                    pull_number: 1
                },
                {
                    owner: 'username',
                    repo: 'action_bump',
                    pull_number: 1
                },
                {
                    owner: 'username',
                    repo: 'action_python',
                    pull_number: 1
                },
                {
                    owner: 'username',
                    repo: 'action_pull_requests',
                    pull_number: 1
                }
            ]);
        });
    });
});