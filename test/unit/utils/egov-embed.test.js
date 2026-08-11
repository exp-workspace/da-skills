import { expect } from '@esm-bundle/chai';
import {
  resolveEgovEmbedUrl,
  resolveEgovEnv,
  resolveEgovMfeEnv,
  resolveEgovPath,
  setEgovPath,
} from '../../../blocks/skills/utils/egov-embed.js';
import { EGOV_MFE } from '../../../blocks/skills/constants.js';

/**
 * A stand-in for `location` + `history`, injected rather than patched onto
 * `window`, whose history is shared with the test runner and can't be rewound
 * between cases.
 *
 * A `URL` serves as `location`, since it exposes `href` and `search`, which is
 * all egov-embed reads. Each recorded write advances it as a real history write
 * would. Hrefs are recorded as plain strings so chai can serialize them into a
 * failure message; a `URL` is expensive for it to deep-inspect.
 */
function recordHistory(startHref = 'https://da.live/skills') {
  const location = new URL(startHref);
  const calls = [];
  const replaceState = (_state, _title, url) => {
    const href = new URL(url, location.href).href;
    calls.push(href);
    location.href = href;
  };
  return { location, calls, history: { state: null, replaceState } };
}

/** Options for a call under test; `h` carries both injected globals. */
const at = (h) => ({ location: h.location, history: h.history });

const lastUrl = ({ calls }) => new URL(calls[calls.length - 1]);

/**
 * A `URL` stands in for `location` here too: env resolution reads only `search`
 * and `hostname`, both of which it exposes.
 */
const urlAt = (href) => new URL(href);

describe('resolveEgovEnv', () => {
  describe('?egov= override', () => {
    it('wins over the hostname', () => {
      // The point of the override is pointing a prod-hosted page at another
      // bundle, so it has to beat a hostname that would otherwise say prod.
      expect(resolveEgovEnv(urlAt('https://da.live/skills?egov=local'))).to.equal('local');
      expect(resolveEgovEnv(urlAt('https://da.live/skills?egov=qa'))).to.equal('qa');
      expect(resolveEgovEnv(urlAt('https://da.live/skills?egov=stage'))).to.equal('stage');
      expect(resolveEgovEnv(urlAt('http://localhost:3000/skills?egov=prod'))).to.equal('prod');
    });

    it('falls back to the hostname when the value is not allow-listed', () => {
      // An unrecognized override must not become an env of its own: it would
      // miss EMBED_URLS and EGOV_MFE_ENVS and take both fallbacks at once.
      expect(resolveEgovEnv(urlAt('https://da.live/skills?egov=bogus'))).to.equal('prod');
      expect(resolveEgovEnv(urlAt('https://da.live/skills?egov='))).to.equal('prod');
      expect(resolveEgovEnv(urlAt('http://localhost:3000/skills?egov=bogus'))).to.equal('stage');
    });

    it('is case-sensitive, so PROD is not an override', () => {
      // SAFE_EGOV_PARAM is lowercase-only; a near-miss must be rejected rather
      // than passed through as an env the lookup tables don't have.
      expect(resolveEgovEnv(urlAt('http://localhost:3000/skills?egov=PROD'))).to.equal('stage');
    });

    it('ignores an override smuggled in the hash rather than the query', () => {
      expect(resolveEgovEnv(urlAt('https://da.live/skills#/org/site?egov=stage'))).to.equal('prod');
    });
  });

  describe('hostname split', () => {
    it('treats localhost and *.aem.page as stage', () => {
      expect(resolveEgovEnv(urlAt('http://localhost:3000/skills'))).to.equal('stage');
      expect(resolveEgovEnv(urlAt('https://main--da-live--adobe.aem.page/skills'))).to.equal('stage');
    });

    it('treats da.live and *.aem.live as prod', () => {
      expect(resolveEgovEnv(urlAt('https://da.live/skills'))).to.equal('prod');
      expect(resolveEgovEnv(urlAt('https://main--da-live--adobe.aem.live/skills'))).to.equal('prod');
    });

    it('falls back to prod for an unrecognized hostname', () => {
      // The security-relevant default: an unknown host must not quietly get
      // stage data behind a production-looking UI.
      expect(resolveEgovEnv(urlAt('https://example.com/skills'))).to.equal('prod');
    });

    it('does not treat aem.page as a suffix match on an attacker domain', () => {
      // `endsWith('.aem.page')` is the guard; a lookalike host must miss it.
      expect(resolveEgovEnv(urlAt('https://aem.page.evil.example/skills'))).to.equal('prod');
      expect(resolveEgovEnv(urlAt('https://notaem.page/skills'))).to.equal('prod');
    });
  });
});

describe('resolveEgovEmbedUrl', () => {
  it('picks the bundle for the resolved env', () => {
    expect(resolveEgovEmbedUrl(urlAt('http://localhost:3000/skills?egov=qa')))
      .to.equal(EGOV_MFE.EMBED_URLS.qa);
    expect(resolveEgovEmbedUrl(urlAt('http://localhost:3000/skills')))
      .to.equal(EGOV_MFE.EMBED_URLS.stage);
    expect(resolveEgovEmbedUrl(urlAt('https://da.live/skills')))
      .to.equal(EGOV_MFE.EMBED_URLS.prod);
  });

  it('serves the prod bundle for an unrecognized host', () => {
    // `resolveEgovEnv` only ever returns an allow-listed env, so this is the
    // reachable route to the fallback rather than the `|| EMBED_URLS.prod`
    // guard, which is unreachable through the public API by construction.
    expect(resolveEgovEmbedUrl(urlAt('https://example.com/skills')))
      .to.equal(EGOV_MFE.EMBED_URLS.prod);
  });
});

describe('resolveEgovMfeEnv', () => {
  it('maps the host env onto the MFE\'s own uppercase Env union', () => {
    // The MFE does no case normalization: anything off this exact set silently
    // selects its STAGE API, so each mapping is load-bearing.
    expect(resolveEgovMfeEnv(urlAt('http://localhost:3000/skills?egov=qa'))).to.equal('QA');
    expect(resolveEgovMfeEnv(urlAt('http://localhost:3000/skills?egov=stage'))).to.equal('STAGE');
    expect(resolveEgovMfeEnv(urlAt('https://da.live/skills'))).to.equal('PROD');
  });

  it('maps local to STAGE, not DEV', () => {
    // `?egov=local` means "bundle from a local dev server", not "local
    // backend": DEV would point the API at localhost:8080 and force every
    // feature flag on.
    expect(resolveEgovMfeEnv(urlAt('http://localhost:3000/skills?egov=local'))).to.equal('STAGE');
  });

  it('sends PROD for an unrecognized host', () => {
    expect(resolveEgovMfeEnv(urlAt('https://example.com/skills'))).to.equal('PROD');
  });
});

describe('setEgovPath', () => {
  it('reflects the path into ?egovPath=', () => {
    const h = recordHistory();
    setEgovPath('/brands/1', at(h));

    expect(h.calls.length).to.equal(1);
    expect(lastUrl(h).search).to.equal('?egovPath=/brands/1');
  });

  it('leaves / unencoded rather than %2F', () => {
    const h = recordHistory();
    setEgovPath('/brands/123/knowledge/connectors', at(h));

    expect(lastUrl(h).href).to.contain('egovPath=/brands/123/knowledge/connectors');
  });

  it('still escapes characters that do need it', () => {
    const h = recordHistory();
    // `%` is the one character SAFE_EGOV_PATH allows that isn't literal-safe in
    // a query string, so un-escaping only `%2F` must leave it encoded.
    setEgovPath('/brands/100%/knowledge', at(h));

    expect(lastUrl(h).search).to.equal('?egovPath=/brands/100%25/knowledge');
  });

  it('keeps other params and drops any stale egovPath', () => {
    const h = recordHistory('https://da.live/skills?egov=qa&egovPath=/brands/old&tab=context');
    setEgovPath('/brands/new', at(h));

    const url = lastUrl(h);
    expect(url.searchParams.get('egov')).to.equal('qa');
    expect(url.searchParams.get('tab')).to.equal('context');
    expect(url.search.match(/egovPath=/g).length).to.equal(1);
    expect(resolveEgovPath(url)).to.equal('/brands/new');
  });

  it('omits the param entirely for the root path', () => {
    // Mirrors the tab-exit reset in nx-skills-editor.js.
    const h = recordHistory('https://da.live/skills?egovPath=/brands/1');
    setEgovPath('/', at(h));

    expect(lastUrl(h).search).to.equal('');
  });

  it('ignores paths outside SAFE_EGOV_PATH', () => {
    const h = recordHistory();
    setEgovPath('', at(h));
    setEgovPath('brands/1', at(h));
    setEgovPath('https://evil.example/', at(h));
    setEgovPath('/brands/<script>', at(h));

    expect(h.calls).to.be.empty;
  });
});

describe('resolveEgovPath', () => {
  const from = (search) => resolveEgovPath(new URL(`https://da.live/skills${search}`));

  it('reads a deep-link path from ?egovPath=', () => {
    expect(from('?egovPath=/brands/123/knowledge/connectors'))
      .to.equal('/brands/123/knowledge/connectors');
  });

  it('accepts an equivalently encoded path', () => {
    expect(from('?egovPath=%2Fbrands%2F1')).to.equal('/brands/1');
  });

  it('falls back to / when the param is absent', () => {
    expect(from('')).to.equal('/');
  });

  it('falls back to / when the param is malformed', () => {
    // The MFE's own parsePath treats unknown segments as "no match" and shows
    // the brand list, so a rejected path degrades the same way either side.
    expect(from('?egovPath=brands/no-leading-slash')).to.equal('/');
    expect(from('?egovPath=https://evil.example/')).to.equal('/');
    expect(from('?egovPath=/brands/<script>')).to.equal('/');
  });
});
