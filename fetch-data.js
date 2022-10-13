const path = require('path');
const fs = require('fs/promises');
const fetch = require('cross-fetch');
const { Octokit } = require('octokit');
const { exit } = require('process');

// Github SDK
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

const org = process.env.ORG_NAME;
const rawBaseUrl = 'https://raw.githubusercontent.com/';
const manifestFilename = 'package.json';
const gitProto = 'github:';
const orgDepRegex = `${gitProto}([A-Za-z0-9_/-]*)(?:.git)?(?:#(.*))?`;

const OctokitErrors = {
  NO_COMMIT_FOUND: 422,
  EMPTY_REPO: 409,
};

// We will build the deps graph from this cache
const cache = {};
// Cache keys builder
const key = (repoName, commitHash) =>
  `${repoName.replace(`${org}/`, '')}@${commitHash}`;

/**
 * Helper function to partition an array given a filer
 */
function partition(array, isValid) {
  return array.reduce(
    ([pass, fail], elem) => {
      return isValid(elem) ? [[...pass, elem], fail] : [pass, [...fail, elem]];
    },
    [[], []],
  );
}

/**
 * Gets the last commit hash on a given branch
 */
async function fetchLastCommit(name, branch) {
  try {
    const commit = await octokit.request(
      `GET /repos/${name}/commits/${branch}`,
    );
    return commit.data.sha;
  } catch (error) {
    if (error.status === OctokitErrors.NO_COMMIT_FOUND) {
      return `[DEAD]${branch}`;
    } else if (error.status === OctokitErrors.EMPTY_REPO) {
      return null;
    } else {
      throw error;
    }
  }
}

/**
 * Given a dependencies list, normalizes org-specific dependencies and
 * recursively populates the cache with subdepenencies from them
 * @param {{[dep: string]: string}} deps
 */
async function parseDeps(deps) {
  const isOrgDep = ([name, version]) =>
    (name.startsWith(org) || name.startsWith(`@${org}`)) &&
    version.startsWith(gitProto);

  const [orgDeps, otherDeps] = partition(Object.entries(deps), isOrgDep);

  const normalizedOrgDeps = Promise.all(
    orgDeps.map(async ([_, version]) => {
      const [match, name, branch] = version.match(new RegExp(orgDepRegex));
      // recurse on subdep
      const commitHash = await populateDeps(name, branch);
      return key(name, commitHash);
    }),
  );

  return [
    ...(await normalizedOrgDeps),
    ...otherDeps.map(([name, version]) => key(name, version)),
  ];
}

/**
 * Gets the default branch
 */
async function fetchDefaultBranch(repoName) {
  const repo = await octokit.request(`GET /repos/${repoName}`);
  return repo.data.default_branch;
}

/**
 * Recursively populates the cache with the subtree rooted at the given repo at given commit
 * @param {string} repoName
 * @param {string} branch
 * @returns
 */
async function populateDeps(repoName, optBranch) {
  const branch = optBranch ?? (await fetchDefaultBranch(repoName));

  if (!repoName.startsWith(org)) return;
  const commitHash = await fetchLastCommit(repoName, branch);
  if (commitHash === null) return null;
  if (cache[key(repoName, commitHash)]) return commitHash;

  const manifestUrl = path.join(
    rawBaseUrl,
    repoName,
    commitHash,
    manifestFilename,
  );

  const res = await fetch(manifestUrl);
  if (res.status !== 200) return commitHash;
  const manifest = await res.json();
  if (!manifest.dependencies) return commitHash;
  const normalizedDeps = await parseDeps(manifest.dependencies);

  cache[key(repoName, commitHash)] = normalizedDeps;
  return commitHash;
}

/**
 * Constructs the dependencies cache map
 */
async function fetchData() {
  // start at roots with repo orgs
  const repos = await octokit.paginate(`GET /orgs/${org}/repos`);

  await Promise.all(
    repos.map((repo) => populateDeps(repo.full_name, repo.default_branch)),
  );

  await fs.mkdir(path.dirname(process.env.OUT_PATH), { recursive: true });
  await fs.writeFile(process.env.OUT_PATH, JSON.stringify(cache, null, 4), {
    encoding: 'utf-8',
  });
}

fetchData();
