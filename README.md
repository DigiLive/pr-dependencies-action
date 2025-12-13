# PR Dependencies Action

A GitHub Action that helps manage and visualize dependencies between issues and pull requests.  
It parses descriptions and comments to identify and track issues/PRs for dependency relationships, and then updates them
with status information and helpful links.

## Features

- **Dependency Tracking**: Tracks both dependencies and dependents.
- **Smart Commenting**: Adds helpful comments with dependency status and navigation links.
- **Automatic Labeling**: Adds/removes 'blocked' and 'blocking' labels
- **Flexible Configuration**: Customizable phrases and labels and works with public and private repositories.
- **Supports Multiple Formats**: Understands various PR/issue reference formats.

## How It Works

When triggered, the action:

- Scans the description and comments for dependency declarations.
- Identifies both dependencies and dependents.
- Adds a dedicated comment with the current status.
- Adds/removes labels based on status.
- Updates any dependency and dependent similarly.

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
name: Dependencies Checker

on:
  pull_request:
    types: [opened, edited, reopened, synchronize]
  issues:
  types: [opened, reopened, edited, closed]

jobs:
  check_dependencies:
    name: Check Dependencies
    runs-on: ubuntu-latest
    permissions:
      contents: read # Not required; Meant for possible future use.
      pull-requests: write # Required to read and comment on other PRs
      issues: write # Required to read and comment on other issues

    steps:
      - uses: digilive/pr-dependency-checker@main # Replace main with a specific version tag (usually the latest release tag).
        with:
          phrases: 'depends on|blocked by' # Pipe separated list of phrases to identify dependency declarations.
          blocked_label: 'blocked' # Label to add if an issue/PR is blocked by another.
          blocking_label: 'blocking' # Label to add if an issue/PR is blocking another.
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

## Usage in Issues/PRs

In your description, specify dependencies using the phrases as **configured via the workflow input**:

```markdown

Depends on: #123
Blocked by: [#456](https://github.com/username/repo/pull/456)
```

The action will automatically detect these references and update the issue/PR with the current status of the
dependencies and the dependencies themselves.

> [!NOTE]
> - If an issue's/PR's state changes (E.g.: open, closed), the action will re-evaluate and update the _dependencies_ of
>   that issue/PR.
> - If a dependency's state changes, any _dependents_ of that dependency will be updated.
> - This action does **NOT** update the state of any issue/PR; It only comments on and updates labels.

## Self-Hosted Runners

This action works with GitHub-hosted runners. For self-hosted runners, ensure:

1. Node.js 20 is installed.
2. The runner has access to GitHub's API.
3. Proper authentication is configured if accessing private repositories.

## License

This project is licensed under the BSD 3-Clause License - see the [LICENSE](LICENSE) file for details.
