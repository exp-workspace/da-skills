import { expect } from '@esm-bundle/chai';
import {
  parseOrgSite,
  hasEwEnabled,
  buildConfigWithEwEnabled,
  hasCorrectSidekickConfig,
  buildUpdatedSidekickConfig,
} from '../../../tools/ew-setup/utils.js';

describe('parseOrgSite', () => {
  it('parses /org/site', () => {
    expect(parseOrgSite('/myorg/mysite')).to.deep.equal({ org: 'myorg', site: 'mysite' });
  });
  it('parses org/site without leading slash', () => {
    expect(parseOrgSite('myorg/mysite')).to.deep.equal({ org: 'myorg', site: 'mysite' });
  });
  it('strips trailing slashes', () => {
    expect(parseOrgSite('/myorg/mysite/')).to.deep.equal({ org: 'myorg', site: 'mysite' });
  });
  it('returns null for empty input', () => {
    expect(parseOrgSite('')).to.be.null;
    expect(parseOrgSite(null)).to.be.null;
  });
  it('returns null when only one segment', () => {
    expect(parseOrgSite('/myorg')).to.be.null;
  });
  it('returns null when three or more segments', () => {
    expect(parseOrgSite('/myorg/mysite/extra')).to.be.null;
  });
});

describe('hasEwEnabled', () => {
  it('returns true when ew.enabled flag is true', () => {
    const json = { flags: { data: [{ key: 'ew.enabled', value: 'true' }] } };
    expect(hasEwEnabled(json)).to.be.true;
  });
  it('returns true when ew.enabled value is "TRUE" (case-insensitive)', () => {
    const json = { flags: { data: [{ key: 'ew.enabled', value: 'TRUE' }] } };
    expect(hasEwEnabled(json)).to.be.true;
  });
  it('returns false when ew.enabled flag is false', () => {
    const json = { flags: { data: [{ key: 'ew.enabled', value: 'false' }] } };
    expect(hasEwEnabled(json)).to.be.false;
  });
  it('returns false when ew.enabled flag is absent', () => {
    const json = { flags: { data: [{ key: 'other.flag', value: 'true' }] } };
    expect(hasEwEnabled(json)).to.be.false;
  });
  it('returns false when flags.data is not an array', () => {
    expect(hasEwEnabled({ flags: {} })).to.be.false;
  });
  it('returns false when flags key is missing', () => {
    expect(hasEwEnabled({})).to.be.false;
  });
  it('returns false for null input', () => {
    expect(hasEwEnabled(null)).to.be.false;
  });
});

describe('buildConfigWithEwEnabled', () => {
  it('creates a minimal flags config when existingJson is null', () => {
    const result = buildConfigWithEwEnabled(null);
    expect(result).to.deep.equal({ flags: { data: [{ key: 'ew.enabled', value: 'true' }] } });
  });
  it('adds ew.enabled to a config that has no flags', () => {
    const result = buildConfigWithEwEnabled({ project: 'My Project' });
    expect(result.flags.data).to.deep.include({ key: 'ew.enabled', value: 'true' });
    expect(result.project).to.equal('My Project');
  });
  it('appends ew.enabled row to existing flags.data', () => {
    const json = { flags: { data: [{ key: 'other.flag', value: 'x' }] } };
    const result = buildConfigWithEwEnabled(json);
    expect(result.flags.data).to.have.length(2);
    expect(result.flags.data[1]).to.deep.equal({ key: 'ew.enabled', value: 'true' });
  });
  it('replaces an existing ew.enabled row rather than duplicating it', () => {
    const json = { flags: { data: [{ key: 'ew.enabled', value: 'false' }] } };
    const result = buildConfigWithEwEnabled(json);
    const ewRows = result.flags.data.filter((r) => r.key === 'ew.enabled');
    expect(ewRows).to.have.length(1);
    expect(ewRows[0].value).to.equal('true');
  });
  it('appends "flags" to :names when flags key did not previously exist', () => {
    const json = { ':names': ['settings'], settings: { data: [] } };
    const result = buildConfigWithEwEnabled(json);
    expect(result[':names']).to.include('flags');
  });
  it('does not append "flags" to :names when flags key already existed', () => {
    const json = { ':names': ['flags'], flags: { data: [] } };
    const result = buildConfigWithEwEnabled(json);
    const flagsCount = result[':names'].filter((n) => n === 'flags').length;
    expect(flagsCount).to.equal(1);
  });
  it('does not mutate the input object', () => {
    const json = { flags: { data: [{ key: 'other', value: 'x' }] } };
    buildConfigWithEwEnabled(json);
    expect(json.flags.data).to.have.length(1);
  });
});

describe('hasCorrectSidekickConfig', () => {
  const PATTERN = 'https://da.live/canvas#/{{org}}/{{site}}{{pathname}}';
  it('returns true when editUrlPattern matches', () => {
    expect(hasCorrectSidekickConfig({ editUrlPattern: PATTERN })).to.be.true;
  });
  it('returns false when editUrlPattern differs', () => {
    expect(hasCorrectSidekickConfig({ editUrlPattern: 'https://other.example.com' })).to.be.false;
  });
  it('returns false when editUrlPattern is missing', () => {
    expect(hasCorrectSidekickConfig({ project: 'My Project' })).to.be.false;
  });
  it('returns false for null input', () => {
    expect(hasCorrectSidekickConfig(null)).to.be.false;
  });
});

describe('buildUpdatedSidekickConfig', () => {
  const PATTERN = 'https://da.live/canvas#/{{org}}/{{site}}{{pathname}}';
  it('creates bare minimum config when existingJson is null', () => {
    const result = buildUpdatedSidekickConfig(null);
    expect(result).to.deep.equal({ project: 'Experience Workspace Project', editUrlPattern: PATTERN });
  });
  it('injects editUrlPattern into existing config', () => {
    const result = buildUpdatedSidekickConfig({ project: 'My Project', plugins: [] });
    expect(result.editUrlPattern).to.equal(PATTERN);
    expect(result.project).to.equal('My Project');
    expect(result.plugins).to.deep.equal([]);
  });
  it('overwrites an existing editUrlPattern', () => {
    const result = buildUpdatedSidekickConfig({ editUrlPattern: 'https://old.example.com' });
    expect(result.editUrlPattern).to.equal(PATTERN);
  });
  it('does not mutate the input object', () => {
    const input = { project: 'My Project' };
    buildUpdatedSidekickConfig(input);
    expect(input).to.not.have.property('editUrlPattern');
  });
});
