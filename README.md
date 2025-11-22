# PR Dependencies Action

A GitHub Action that helps manage and visualize dependencies between pull requests.  
It parses PR descriptions and comments to identify and track dependent PRs, then updates the PR with status information
and helpful links.

## Features

- **Dependency Detection**: Automatically identifies PR dependencies from the PR description and comments.
- **Status Updates**: Updates PR status based on the state of dependent PRs.
- **Smart Commenting**: Adds helpful comments with dependency status and navigation links.
- **Flexible Configuration**: Works with public and private repositories.
- **Supports Multiple Formats**: Understands various PR/issue reference formats.

## How It Works

1. Scans the PR description and comments for dependency declarations.
2. Validates the status of dependent PRs.
3. Adds helpful comments with navigation links.
4. Labels the PR with current dependency status.

## Supported Reference Formats

The action can detect PR/issue references in these formats:

- Quick Reference: `#123`
- Repository Reference: `username/repo#123`
- Partial URL: `username/repo/pull/123`
- Full URL: `https://github.com/username/repo/pull/123`
- Markdown Links: `[PR #123](https://github.com/username/repo/pull/123)`

## Quick Start

Add this to a yml file in your `.github/workflows/`:

```yaml
name: PR Dependencies

on:
  pull_request:
    types: [opened, edited, reopened, synchronize]

jobs:
  check_dependencies:
    name: Check Dependencies
    runs-on: ubuntu-latest
    permissions:
      contents: read # Not required; Meant for possible future use.
      pull-requests: write # Required to read other PRs

    steps:
      - uses: digilive/pr-dependency-checker@main
        with:
          phrases: 'depends on|blocked by' # Pipe separated list of phrases to identify dependency declarations.
          label: 'blocked' # Label to add to the PR if it has dependencies.
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }} # To interact with the GitHub API.
```

## Pull Request from a forked repository

The standard `secrets.GITHUB_TOKEN` works for pull requests of your own repository.  
For a pull request from a forked repository, you must either approve the run of the workflow manually or use a
[Personal Access Token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#creating-a-fine-grained-personal-access-token)
(PAT).

> [!IMPORTANT]
> The PAT is required only for workflows triggered by pull requests from forks if you want commenting/labeling to work
> automatically.

### PAT Requirements

#### Required Scopes

- (classic PAT) `repo` - Full control of private repositories

or

- Fine-grained PAT with:
  - **Repository permissions**:
    - Contents: Read-only (Optional; For future use)
    - Metadata: Read-only
    - Pull requests: Read and write

### Token Setup

- Create a PAT in [GitHub Settings > Developer Settings](https://github.com/settings/tokens).
- Store it as a repository secret (e.g., `PR_DEPENDENCIES_PAT`).
- Update your workflow to use the PAT:

   ```yaml
   env:
     GITHUB_TOKEN: ${{ secrets.PR_DEPENDENCIES_PAT }}
   ```

## Usage in PRs

In your PR description, specify dependencies using the phrases as **configured via the workflow input**:

```markdown

Depends on: #123
Blocked by: [#456](https://github.com/username/repo/pull/456)
```

The action will automatically detect these references and update the PR with the current status of the dependencies.

## Self-Hosted Runners

This action works with GitHub-hosted runners. For self-hosted runners, ensure:

1. Node.js 20 is installed.
2. The runner has access to GitHub's API.
3. Proper authentication is configured if accessing private repositories.

## License

This project is licensed under the BSD 3-Clause License - see the [LICENSE](LICENSE) file for details.
