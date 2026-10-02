# Repository setup for owner review

repository-settings.json records the desired configuration. Repository metadata, topics, private vulnerability reporting, secret scanning, push protection and the release-draft environment were applied and verified on 2026-10-02. Branch protection remains deferred until the separately approved public-history replacement. GitHub CLI must run with access to Windows Credential Manager; the sandbox can otherwise report an invalid token despite a working login.

The owner has authorized the repository description, topics and security setup in the release plan. After authentication, apply repository fields with PATCH /repos/byrnane/folden; topics with PUT /repos/byrnane/folden/topics (names from topics); and protection with PUT /repos/byrnane/folden/branches/master/protection using branch_protection. Verify actual CI check names before enforcement. Keep administrator enforcement off for the owner-managed repository. Apply protection after the separately approved history replacement.

Enable private vulnerability reporting with PUT /repos/byrnane/folden/private-vulnerability-reporting and verify GET returns enabled=true. Enable free secret scanning/push protection where GitHub offers it, and verify the returned security_and_analysis status; absence/null is not proof of activation.

Resolve the byrnane account's numeric GitHub ID before PUT /repos/byrnane/folden/environments/release-draft: replace the payload's review-label login with id. Add an environment deployment branch policy for v* with type tag. Confirm the owner can approve the draft job and ordinary candidate branch pushes cannot run it. Environment feature availability depends on the repository/account configuration.

Dispatch the draft workflow on the version tag itself, with the tag input set to that same tag. The environment rule checks the workflow run's GITHUB_REF; checking out a tag inside a job does not change it. A run dispatched from the default branch with only the tag input filled will not match the tag-only policy. See [GitHub's environment rules](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments#deployment-branches-and-tags).

Set the social preview to [docs/assets/social-preview.png](../docs/assets/social-preview.png), rendered at 1280 × 640 from the project's original vector banner. Check the README, exact-version release link, custom-license display and assets in GitHub. Do not label the project open source: author source is available for inspection under a custom restrictive license.

Review the separate cleaned repository's commit/tree comparison and secret scan before exposing replacement history. Original refs/index and verified backup must remain unchanged. No force push, tag creation, release publication or remote setting write is authorized by this instruction file alone.

Описание, темы, приватные сообщения об уязвимостях, secret scanning, push protection и environment release-draft применены и проверены 2026-10-02. Защита ветки откладывается до отдельно согласованной замены публичной истории. Запускайте draft workflow на теге версии и передавайте тот же tag input: environment проверяет GITHUB_REF запуска, а не checkout внутри job. Замена истории и публикация согласуются отдельно.
