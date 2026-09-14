const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../shared/default-download-method.js'), 'utf8');

// Small DOM adapter: exercise the production initialization, labels and click handler.
function element(kind, children = []) {
  const el = {
    kind, children, dataset: {},
    matches: selector => selector === 'a' && kind === 'link',
    querySelectorAll(selector) {
      const descendants = children.flatMap(child => [child, ...child.querySelectorAll('*')]);
      if (selector === '*') return descendants;
      if (selector.includes('browsable') || selector.includes('download-all')) return [];
      if (selector.includes('other-downloads-button')) return descendants.filter(child => child.kind === 'dropdown');
      return descendants.filter(child => child.kind === 'regular' || child.kind === 'link');
    },
    querySelector(selector) { return selector === 'button' ? this.button : null; }
  };
  children.forEach(child => { child.parentElement = el; });
  return el;
}

function setup(pairs, sharedContainer = false) {
  const regulars = pairs.map(([url]) => {
    const regular = element(sharedContainer ? 'link' : 'regular');
    if (sharedContainer) regular.href = url;
    else regular.dataset.href = url;
    regular.button = sharedContainer ? regular : {};
    regular.button.text = { textContent: 'ダウンロード', isConnected: true };
    return regular;
  });
  const dropdowns = pairs.map(([, url]) => {
    const dropdown = element('dropdown');
    dropdown.dataset.dropdownItems = JSON.stringify([{ deeplinkDownloadableUrl: url }]);
    return dropdown;
  });
  const body = element('body', sharedContainer
    ? [element('cart', [...regulars, ...dropdowns.map(dropdown => element('wrapper', [dropdown]))])]
    : pairs.map((_, i) => element('row', [regulars[i], element('wrapper', [dropdowns[i]])])));
  let change, click;
  const launched = [], history = [], requests = [];
  const document = {
    body, documentElement: body,
    querySelectorAll: selector => body.querySelectorAll(selector),
    createTreeWalker(button) { let text = button.text; return { nextNode() { const next = text; text = null; return next; } }; },
    createElement: () => ({ style: {}, click() { launched.push(this.href); }, remove() {} }),
    addEventListener: (_, listener) => { click = listener; }
  };
  body.appendChild = () => {};
  const window = { assetConnectDownloadAdapter: {
    getInfo: regular => ({ url: regular.dataset.href || regular.href }),
    save: async info => history.push(info)
  } };
  vm.runInNewContext(source, {
    window, document, URL, NodeFilter: { SHOW_TEXT: 4 },
    MutationObserver: class { observe() {} },
    alert: message => assert.fail(message),
    chrome: {
      i18n: { getMessage: () => '' },
      storage: {
        local: { get: (_, callback) => callback({ defaultDownloadMethod: 'booth-library-manager' }) },
        onChanged: { addListener: callback => { change = callback; } }
      },
      runtime: {
        onMessage: { addListener() {} },
        sendMessage: async request => { requests.push(request); return { success: true, deeplink: 'vrcae:test' }; }
      }
    }
  });
  return { regulars, launched, history, requests, window,
    change: method => change({ defaultDownloadMethod: { newValue: method } }, 'local'),
    async click(index) {
      let prevented = false;
      click({ target: { closest: selector => selector.startsWith('.js-download-button') ? regulars[index] : null },
        preventDefault() { prevented = true; }, stopImmediatePropagation() {} });
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(prevented, true);
    }
  };
}

const normal = (id, suffix = '') => `https://booth.pm/downloadables/${id}${suffix}`;
const deeplink = (id, suffix = '') => normal(id, `/deeplink?client=booth-library-manager${suffix}`);

for (const [name, pairs, shared] of [
  ['shop: 20 files in one container', Array.from({ length: 20 }, (_, i) =>
    [normal(100 + i, '?variation_id=7'), deeplink(100 + i, '&variation_id=7')]), true],
  ['variation only in deeplink', [[normal(101), deeplink(101, '&variation_id=7')]], false],
  ['variation only in normal URL', [[normal(101, '?variation_id=7'), deeplink(101)]], false],
  // URL pairs from the supplied download-page HTML; each file has its own row.
  ['download page: all 14 supplied files', [
    9357847, 9357849, 9357850, 9357852, 9357854, 9357855, 9357858,
    9357853, 9357859, 9357857, 9357860, 9384948, 9413108, 9357856
  ].map(id => [normal(id), deeplink(id, '&variation_id=14435615')]), false],
  ['separate rows with differing query parameters', [
    [normal(101, '?token=test'), deeplink(101, '&variation_id=7')],
    [normal(102, '?token=test'), deeplink(102, '&variation_id=8')]
  ], false],
  ['same file in different variations', [
    [normal(101, '?variation_id=7'), deeplink(101, '&variation_id=7')],
    [normal(101, '?variation_id=8'), deeplink(101, '&variation_id=8')]
  ], true]
]) {
  test(name, async () => {
    const env = setup(pairs, shared);
    for (let i = 0; i < pairs.length; i++) {
      assert.equal(env.regulars[i].button.text.textContent, 'BOOTH Library Managerでダウンロード');
      await env.window.assetConnectDefaultDownload.launchForRegular(env.regulars[i]);
      assert.equal(env.launched.at(-1), pairs[i][1]);
      assert.equal(env.history.at(-1).url, pairs[i][0]);
    }
    env.change('avatar-explorer');
    for (let i = 0; i < pairs.length; i++) {
      assert.equal(env.regulars[i].button.text.textContent, 'AvatarExplorerでダウンロード');
      await env.click(i);
      assert.equal(env.requests.at(-1).deeplinkUrl, pairs[i][1]);
      assert.equal(env.history.at(-1).url, pairs[i][0]);
    }
    env.change('normal');
    env.regulars.forEach(regular => assert.equal(regular.button.text.textContent, 'ダウンロード'));
  });
}

for (const [name, pairs] of [
  ['different file IDs', [[normal(101), deeplink(102)]]],
  ['conflicting explicit variations', [[normal(101, '?variation_id=7'), deeplink(101, '&variation_id=8')]]],
  ['ambiguous missing variation', [[normal(101), deeplink(101, '&variation_id=7')], [normal(102), deeplink(101, '&variation_id=8')]]]
]) {
  test(`do not match ${name}`, async () => {
    const env = setup(pairs, true);
    await assert.rejects(env.window.assetConnectDefaultDownload.launchForRegular(env.regulars[0]), /not found/);
    assert.equal(env.launched.length, 0);
  });
}
