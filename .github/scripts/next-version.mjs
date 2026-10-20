import { appendFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';

const baseline = process.env.RELEASE_BASE_VERSION ?? '1.0.0';

function parseVersion(value) {
  const match = value.match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  if (!match) throw new Error(`Invalid SemVer value: ${value}`);
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function formatVersion(version) {
  return `${version.major}.${version.minor}.${version.patch}`;
}

function latestVersionTag() {
  const result = spawnSync('git', ['describe', '--tags', '--match', 'v[0-9]*', '--abbrev=0'], {
    encoding: 'utf8',
  });
  if (result.status !== 0) return null;
  return result.stdout.trim();
}

const tag = latestVersionTag();
let version = parseVersion(tag ?? baseline);

if (tag) {
  const messages = execFileSync('git', ['log', '--format=%B', `${tag}..HEAD`], {
    encoding: 'utf8',
  });
  const breaking = /BREAKING[ -]CHANGE|^[a-z]+(?:\([^\n()]+\))?!:/m.test(messages);
  const feature = /^feat(?:\([^\n()]+\))?!?:/m.test(messages);

  if (breaking) {
    version = { major: version.major + 1, minor: 0, patch: 0 };
  } else if (feature) {
    version = { major: version.major, minor: version.minor + 1, patch: 0 };
  } else {
    version = { major: version.major, minor: version.minor, patch: version.patch + 1 };
  }
}

const output = formatVersion(version);
const githubOutput = process.env.GITHUB_OUTPUT;
if (githubOutput) appendFileSync(githubOutput, `version=${output}\ntag=v${output}\n`);
console.log(`Next release version: ${output}`);
