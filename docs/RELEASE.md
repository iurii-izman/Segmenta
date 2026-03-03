# Release process

## Prerequisites

- Repository on GitHub (create via [GitHub](https://github.com/new) or `gh repo create`).
- Remote configured: `git remote add origin https://github.com/USER/REPO.git`
- Update `package.json` fields `repository`, `homepage`, and `bugs` with the real repo URL.

## Creating the repository and first push

1. Create a new repository on GitHub (do not initialize with README if the project already has one).
2. In the project root:
   ```bash
   git remote add origin https://github.com/USER/REPO.git
   git branch -M main
   git push -u origin main
   ```
3. Replace `USER` and `REPO` in `package.json` with your GitHub user and repo name.

## Releasing Alpha 1 (or any version)

1. **Pre-alpha checklist** (see plan block 11): Lint, tests, and build pass; docs and i18n are in sync.

2. **Bump version** to e.g. `0.2.0-alpha.1`:
   - `package.json` → `"version": "0.2.0-alpha.1"`
   - `src-tauri/tauri.conf.json` → `"version": "0.2.0-alpha.1"`

3. **Update CHANGELOG.md**:
   - Move content from `[Unreleased]` into `[0.2.0-alpha.1] - YYYY-MM-DD`.
   - Keep `[Unreleased]` with a placeholder for the next cycle.

4. **Commit and push**:
   ```bash
   git add package.json src-tauri/tauri.conf.json CHANGELOG.md
   git commit -m "chore: release 0.2.0-alpha.1"
   git push origin main
   ```

5. **Create and push tag** (triggers the Release workflow):
   ```bash
   git tag v0.2.0-alpha.1
   git push origin v0.2.0-alpha.1
   ```

6. **GitHub Actions** will run [.github/workflows/release.yml](../.github/workflows/release.yml): build Tauri, collect the binary and AppImage (if present), and create a GitHub Release with those artifacts. No extra secrets are required; `GITHUB_TOKEN` is provided automatically.

7. **Releases** are visible under the repo’s **Releases** tab. Users can download the binary and AppImage from there.

## Optional: token from keyring for local scripts

If you write a local script that creates releases via the GitHub API, you can pass a token from your environment or from `gh auth token` (if using `gh` CLI with keyring-backed auth):

```bash
export GH_TOKEN=$(gh auth token)
# then run your script
```

The CI release workflow does not need this; it uses the built-in `GITHUB_TOKEN`.
