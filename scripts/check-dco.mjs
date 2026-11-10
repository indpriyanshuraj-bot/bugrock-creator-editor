#!/usr/bin/env node
// DCO check: every non-merge commit in a PR needs a Signed-off-by trailer.
import { readFile } from 'node:fs/promises';

const token = process.env.GITHUB_TOKEN;
const eventPath = process.env.GITHUB_EVENT_PATH;
const repo = process.env.GITHUB_REPOSITORY;

const SKIP_AUTHORS = new Set(['dependabot[bot]', 'github-actions[bot]']);
const SIGN = /^Signed-off-by:\s+(.+?)\s*<([^>]+)>\s*$/gim;

async function main() {
  if (!eventPath || !repo) {
    console.log('not a PR context; skipping');
    return 0;
  }
  const event = JSON.parse(await readFile(eventPath, 'utf8'));
  const pr = event.pull_request;
  if (!pr) {
    console.log('no pull_request in event; skipping');
    return 0;
  }
  if (SKIP_AUTHORS.has(pr.user?.login)) {
    console.log(`author ${pr.user.login} is exempt`);
    return 0;
  }

  const res = await fetch(
    `https://api.github.com/repos/${repo}/pulls/${pr.number}/commits?per_page=100`,
    {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'user-agent': 'bugrock-dco',
      },
    },
  );
  if (!res.ok) {
    console.error(`could not list commits: ${res.status}`);
    return 1;
  }
  const commits = await res.json();
  const offenders = [];
  for (const c of commits) {
    const message = c.commit?.message ?? '';
    const author = c.commit?.author?.name ?? '?';
    const email = c.commit?.author?.email ?? '';
    if (message.split('\n')[0]?.startsWith('Merge ')) continue;
    const signs = [...message.matchAll(SIGN)].map((m) => m[2].toLowerCase());
    if (!signs.includes(email.toLowerCase()))
      offenders.push(`${c.sha.slice(0, 7)} ${author} <${email}>`);
  }
  if (offenders.length > 0) {
    console.error('Missing DCO sign-off (use `git commit -s`):');
    for (const o of offenders) console.error('  ' + o);
    return 1;
  }
  console.log(`dco ok (${commits.length} commits)`);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
