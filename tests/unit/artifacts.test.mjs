// @ts-check
// Artifact dependencies: images, S3 objects, package registries, Terraform modules and Helm charts a
// project pulls (consumes) or publishes (produces), with file and line. Read-only; credentials never printed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { detectArtifacts, ARTIFACT_CAP } from '../../plugin/scripts/lib/artifacts.mjs';
import { detectDependencies } from '../../plugin/scripts/lib/deps.mjs';
import { makeTree } from '../helpers/tree.mjs';

const cli = fileURLToPath(new URL('../../plugin/scripts/devocd.mjs', import.meta.url));
const ECR = '123456789012.dkr.ecr.us-east-1.amazonaws.com';
const SECRET = 'npmSECRETtoken9f8e7d6c5b4a39281706';

/** @param {import('node:test').TestContext} t @param {Record<string, string>} files */
function fixture(t, files) {
  const root = mkdtempSync(join(tmpdir(), 'devocd-art-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return makeTree(root, files);
}

const TREE = {
  'Dockerfile': `FROM ${ECR}/base/node:20 AS build\nRUN npm ci\nFROM build AS test\nFROM scratch\nFROM python:3.12-slim\n`,
  'docker-compose.yml': 'services:\n  cache:\n    image: redis:7\n',
  'k8s/deploy.yaml': `spec:\n  containers:\n    - name: api\n      image: ${ECR.replace('us-east-1', 'eu-west-1')}/api:1.2\n    - name: side\n      image: "{{ .Values.sidecar }}"\n`,
  '.github/workflows/build.yml': [
    'env:',
    '  GOPROXY: https://goproxy.acme.io',
    'jobs:',
    '  build:',
    '    steps:',
    '      - run: docker build -t $ECR_REGISTRY/api:${{ github.sha }} .',
    '      - run: docker push $ECR_REGISTRY/api:${{ github.sha }}',
    '      - run: aws s3 cp dist/app.zip s3://acme-artifacts/api/app.zip',
    '      - run: aws s3 sync s3://acme-models/v3 ./models',
    `      - run: helm push chart.tgz oci://${ECR}/charts`,
    '',
  ].join('\n'),
  'infra/main.tf': [
    'terraform {',
    '  backend "s3" {',
    '    bucket = "acme-tfstate"',
    '    key    = "api/terraform.tfstate"',
    '  }',
    '}',
    'module "vpc" {',
    '  source = "terraform-aws-modules/vpc/aws"',
    '}',
    'module "iam" {',
    '  source = "git::https://github.com/acme/tf-iam.git?ref=v1.2"',
    '}',
    'module "net" {',
    '  source = "s3::https://s3-eu-west-1.amazonaws.com/acme-tf/net.zip"',
    '}',
    'module "local" {',
    '  source = "./modules/local"',
    '}',
    'data "terraform_remote_state" "shared" {',
    '  backend = "s3"',
    '  config = {',
    '    bucket = "acme-tfstate"',
    '    key    = "shared/terraform.tfstate"',
    '  }',
    '}',
    '',
  ].join('\n'),
  '.npmrc': `@acme:registry=https://acme.jfrog.io/artifactory/api/npm/npm-local/\n//acme.jfrog.io/artifactory/api/npm/npm-local/:_authToken=${SECRET}\n`,
  'package.json': JSON.stringify({ name: 'api', publishConfig: { registry: 'https://nexus.acme.io/repository/npm-releases/' } }, null, 2),
  'requirements.txt': 'requests==2.31.0\n--extra-index-url https://aws:pw12345@acme-123456789012.d.codeartifact.us-east-1.amazonaws.com/pypi/py/simple/\n',
  'pip.conf': '[global]\nindex-url = https://nexus.acme.io/repository/pypi/simple\n',
  'pyproject.toml': '[[tool.poetry.source]]\nname = "internal"\nurl = "https://acme.jfrog.io/artifactory/api/pypi/pypi-local/simple"\n',
  'pom.xml': '<project>\n<repositories><repository>\n<url>https://nexus.acme.io/repository/maven-public/</url>\n</repository></repositories>\n<distributionManagement><repository>\n<url>https://nexus.acme.io/repository/maven-releases/</url>\n</repository></distributionManagement>\n</project>\n',
  'build.gradle': 'repositories {\n  maven { url "https://acme.jfrog.io/artifactory/libs-release" }\n}\n',
  'charts/api/Chart.yaml': 'apiVersion: v2\nname: api\ndependencies:\n  - name: postgresql\n    version: 12.1.0\n    repository: https://charts.bitnami.com/bitnami\n',
  '.env': `NPM_TOKEN=${SECRET}\nIMAGE=${ECR}/never-read:1\n`,
  'node_modules/dep/Dockerfile': 'FROM never/read:1\n',
};

/** @param {ReturnType<typeof detectArtifacts>['artifacts']} list @param {string} kind @param {string} ref */
const find = (list, kind, ref) => list.filter(a => a.kind === kind && a.ref === ref);

test('images: Dockerfile FROM (not stage names or scratch), compose and Kubernetes image lines, ECR flagged', t => {
  const { artifacts } = detectArtifacts(fixture(t, TREE));
  const base = find(artifacts, 'image', `${ECR}/base/node:20`);
  assert.equal(base.length, 1);
  assert.deepEqual({ ...base[0] }, { kind: 'image', ref: `${ECR}/base/node:20`, direction: 'consumes', source: 'Dockerfile', line: 1, flavor: 'ecr' });
  assert.equal(find(artifacts, 'image', 'python:3.12-slim')[0]?.line, 5);
  assert.deepEqual(artifacts.filter(a => a.kind === 'image' && /^(build|scratch)$/.test(a.ref)), [], 'stage names and scratch are not images');
  assert.equal(find(artifacts, 'image', 'redis:7')[0]?.source, 'docker-compose.yml');
  const k8s = find(artifacts, 'image', `${ECR.replace('us-east-1', 'eu-west-1')}/api:1.2`)[0];
  assert.equal(k8s?.source, 'k8s/deploy.yaml');
  assert.equal(k8s?.flavor, 'ecr');
  assert.deepEqual(artifacts.filter(a => a.ref.includes('Values')), [], 'a fully templated value names nothing');
});

test('CI: build/push tags are produced once per file, with variables kept as %NAME%', t => {
  const { artifacts } = detectArtifacts(fixture(t, TREE));
  const pushed = find(artifacts, 'image', '%ECR_REGISTRY%/api:%github.sha%');
  assert.equal(pushed.length, 1, JSON.stringify(artifacts.filter(a => a.kind === 'image')));
  assert.equal(pushed[0].direction, 'produces');
  assert.equal(pushed[0].line, 6, 'first line that names it');
  assert.equal(pushed[0].templated, true);
  assert.equal(find(artifacts, 's3', 's3://acme-artifacts/api/app.zip')[0]?.direction, 'produces');
  assert.equal(find(artifacts, 's3', 's3://acme-models/v3')[0]?.direction, 'consumes');
  const chart = find(artifacts, 'helm-chart', `oci://${ECR}/charts`)[0];
  assert.equal(chart?.direction, 'produces');
  assert.equal(chart?.flavor, 'ecr');
  assert.equal(find(artifacts, 'registry', 'https://goproxy.acme.io')[0]?.direction, 'consumes');
});

test('Terraform: registry, git and s3 module sources; state backend produces, remote state consumes', t => {
  const { artifacts } = detectArtifacts(fixture(t, TREE));
  assert.deepEqual({ ...find(artifacts, 'tf-module', 'terraform-aws-modules/vpc/aws')[0] },
    { kind: 'tf-module', ref: 'terraform-aws-modules/vpc/aws', direction: 'consumes', source: 'infra/main.tf', line: 8, flavor: 'terraform-registry' });
  assert.equal(find(artifacts, 'tf-module', 'git::https://github.com/acme/tf-iam.git?ref=v1.2')[0]?.flavor, 'git', 'a version ref is not a credential');
  assert.equal(find(artifacts, 's3', 's3::https://s3-eu-west-1.amazonaws.com/acme-tf/net.zip')[0]?.direction, 'consumes');
  assert.deepEqual(artifacts.filter(a => a.ref.includes('modules/local')), [], 'local modules are internal');
  const state = find(artifacts, 's3', 's3://acme-tfstate/api/terraform.tfstate')[0];
  assert.equal(state?.direction, 'produces');
  assert.equal(state?.flavor, 'tf-state');
  const remote = find(artifacts, 's3', 's3://acme-tfstate/shared/terraform.tfstate')[0];
  assert.equal(remote?.direction, 'consumes');
  assert.equal(remote?.flavor, 'tf-state');
});

test('registries: npm, pip, Poetry, Maven, Gradle and Helm, consumes vs publishes, with flavor', t => {
  const { artifacts } = detectArtifacts(fixture(t, TREE));
  const reg = (/** @type {string} */ ref) => find(artifacts, 'registry', ref)[0];
  assert.deepEqual([reg('https://acme.jfrog.io/artifactory/api/npm/npm-local/')?.direction, reg('https://acme.jfrog.io/artifactory/api/npm/npm-local/')?.flavor], ['consumes', 'artifactory']);
  assert.deepEqual([reg('https://nexus.acme.io/repository/npm-releases/')?.direction, reg('https://nexus.acme.io/repository/npm-releases/')?.source], ['produces', 'package.json']);
  assert.equal(reg('https://acme-123456789012.d.codeartifact.us-east-1.amazonaws.com/pypi/py/simple/')?.flavor, 'codeartifact', 'userinfo stripped');
  assert.equal(reg('https://nexus.acme.io/repository/pypi/simple')?.flavor, 'nexus');
  assert.equal(reg('https://acme.jfrog.io/artifactory/api/pypi/pypi-local/simple')?.source, 'pyproject.toml');
  assert.equal(reg('https://nexus.acme.io/repository/maven-public/')?.direction, 'consumes');
  assert.equal(reg('https://nexus.acme.io/repository/maven-releases/')?.direction, 'produces');
  assert.equal(reg('https://acme.jfrog.io/artifactory/libs-release')?.source, 'build.gradle');
  assert.deepEqual({ ...find(artifacts, 'helm-chart', 'postgresql@https://charts.bitnami.com/bitnami')[0] },
    { kind: 'helm-chart', ref: 'postgresql@https://charts.bitnami.com/bitnami', direction: 'consumes', source: 'charts/api/Chart.yaml', line: 6 });
});

test('never prints credentials, never reads .env or excluded folders', t => {
  const r = detectArtifacts(fixture(t, TREE));
  const out = JSON.stringify(r);
  for (const leak of [SECRET, 'pw12345', 'aws:', '_authToken']) assert.ok(!out.includes(leak), leak);
  assert.ok(!out.includes('never-read') && !out.includes('never/read'), '.env and node_modules are skipped');
  assert.equal(r.truncated, false);
});

test('a ref that looks like a secret is dropped, and token query parameters are removed', t => {
  const { artifacts } = detectArtifacts(fixture(t, {
    'Dockerfile': 'FROM registry.acme.io/app:1\n',
    'deploy.sh': 'aws s3 cp s3://acme-bin/tool.tgz?X-Amz-Signature=abc123def456&ref=v2 .\ncurl -o x https://example.com/api_key=AKIAABCDEFGHIJKLMNOP\n',
  }));
  assert.equal(find(artifacts, 's3', 's3://acme-bin/tool.tgz?ref=v2')[0]?.direction, 'consumes', JSON.stringify(artifacts));
  assert.ok(!JSON.stringify(artifacts).includes('AKIA'));
  assert.ok(!JSON.stringify(artifacts).includes('Signature'));
});

test('the list is capped and says so', t => {
  const lines = Array.from({ length: ARTIFACT_CAP + 10 }, (_, i) => `FROM acme/img${i}:1`).join('\n');
  const r = detectArtifacts(fixture(t, { 'Dockerfile': `${lines}\n` }));
  assert.equal(r.artifacts.length, ARTIFACT_CAP);
  assert.equal(r.truncated, true);
});

test('detect-dependencies includes the artifacts, and the CLI prints them', t => {
  const root = fixture(t, TREE);
  const deps = detectDependencies(root);
  assert.deepEqual(deps.artifacts, detectArtifacts(root).artifacts);
  assert.equal(deps.artifactsTruncated, false);
  const run = spawnSync(process.execPath, [cli, 'detect-dependencies', root], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const printed = JSON.parse(run.stdout);
  assert.ok(printed.artifacts.some((/** @type {{ref: string}} */ a) => a.ref === 'redis:7'));
  assert.ok(!run.stdout.includes(SECRET));
});

test('aws s3 flags that take a value do not shift source and destination', t => {
  const { artifacts } = detectArtifacts(fixture(t, {
    'deploy.sh': 'aws s3 cp --region us-east-1 --profile ci ./out.zip s3://acme-x/out.zip --recursive\naws s3 sync --exclude "*.tmp" s3://acme-y/data ./data --delete\n',
  }));
  assert.equal(find(artifacts, 's3', 's3://acme-x/out.zip')[0]?.direction, 'produces', JSON.stringify(artifacts));
  assert.equal(find(artifacts, 's3', 's3://acme-y/data')[0]?.direction, 'consumes');
});
