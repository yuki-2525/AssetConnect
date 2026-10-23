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

function setup(pairs, sharedContainer = false, timeoutFn = setTimeout) {
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
    getInfo: regular => ({
      url: regular.dataset.href || regular.href,
      fileName: 'Avatar.zip',
      boothID: '12345'
    }),
    save: async info => history.push(info)
  } };
  vm.runInNewContext(source, {
    window, document, URL, setTimeout: timeoutFn, NodeFilter: { SHOW_TEXT: 4 },
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
    changeAeBulkFormat: format => change({ aeBulkDownloadFormat: { newValue: format } }, 'local'),
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

test('AvatarExplorer bulk download URL construction and chunking <= 2000 chars', () => {
  const env = setup([[normal(101), deeplink(101)]]);
  const defaultDownload = env.window.assetConnectDefaultDownload;

  const singleItem = [{
    variation_id: '789',
    downloadable_filename: 'Avatar.zip',
    dlurl: 'https://booth.pm/downloadables/101'
  }];
  const url = defaultDownload.buildBulkItemImportUrl('123456', singleItem);
  assert.match(url, /^vrcae:\/\/bulk-item-import\?v=1&item_id=123456&items=/);

  const parsedUrl = new URL(url);
  assert.equal(parsedUrl.searchParams.get('v'), '1');
  assert.equal(parsedUrl.searchParams.get('item_id'), '123456');
  const itemsInUrl = JSON.parse(parsedUrl.searchParams.get('items'));
  assert.deepEqual(itemsInUrl, singleItem);

  // 多数のアイテムでチャンキングのテスト (2000文字以下)
  const manyItems = Array.from({ length: 50 }, (_, i) => ({
    variation_id: String(1000 + i),
    downloadable_filename: `VeryLongFileName_Avatar_Model_Costume_Version_${i}.zip`,
    dlurl: `https://booth.pm/downloadables/${10000 + i}?variation_id=${1000 + i}`
  }));

  const chunks = defaultDownload.chunkItemsForUri('123456', manyItems, 2000);
  assert(chunks.length > 1, 'Should split into multiple chunks');

  // 全アイテムが含まれていること
  const flattened = chunks.flat();
  assert.equal(flattened.length, 50);

  // すべてのチャンクが2000文字以下であること
  for (const chunk of chunks) {
    const chunkUrl = defaultDownload.buildBulkItemImportUrl('123456', chunk);
    assert(chunkUrl.length <= 2000, `URI length ${chunkUrl.length} exceeds 2000`);
  }
});

test('AvatarExplorer launchBulk launches vrcae bulk import and saves history', async () => {
  const pairs = [
    [normal(101, '?variation_id=1'), deeplink(101, '&variation_id=1')],
    [normal(102, '?variation_id=2'), deeplink(102, '&variation_id=2')]
  ];
  const env = setup(pairs, false);
  env.change('avatar-explorer');
  env.changeAeBulkFormat('v1');

  let progressReported = [];
  await env.window.assetConnectDefaultDownload.launchBulk(env.regulars, (processed, total) => {
    progressReported.push({ processed, total });
  });

  assert.equal(env.launched.length, 1);
  const launchedUrl = env.launched[0];
  assert.match(launchedUrl, /^vrcae:\/\/bulk-item-import\?v=1&item_id=12345&items=/);

  const parsed = new URL(launchedUrl);
  const items = JSON.parse(parsed.searchParams.get('items'));
  assert.equal(items.length, 2);
  assert.equal(items[0].variation_id, '1');
  assert.equal(items[0].dlurl, pairs[0][0]);
  assert.equal(items[1].variation_id, '2');
  assert.equal(items[1].dlurl, pairs[1][0]);

  // 履歴保存の確認 (registered: true)
  assert.equal(env.history.length, 2);
  assert.equal(env.history[0].registered, true);
  assert.equal(env.history[1].registered, true);

  // 進捗コールバックの確認
  assert.deepEqual(progressReported, [{ processed: 2, total: 2 }]);
});

test('AvatarExplorer launchBulk chunks over 2000 chars and enforces 750ms interval', async () => {
  // 2000文字を超えるアイテム群を作成
  const count = 30;
  const pairs = Array.from({ length: count }, (_, i) => [
    normal(1000 + i, `?variation_id=${1000 + i}&extra_token_padding=${'x'.repeat(60)}`),
    deeplink(1000 + i, `&variation_id=${1000 + i}`)
  ]);
  const delays = [];
  const customTimeout = (fn, ms) => {
    delays.push(ms);
    return setImmediate(fn);
  };
  const env = setup(pairs, false, customTimeout);
  env.change('avatar-explorer');
  env.changeAeBulkFormat('v1');

  await env.window.assetConnectDefaultDownload.launchBulk(env.regulars);

  assert(env.launched.length > 1, 'Should launch multiple URIs');
  for (const uri of env.launched) {
    assert(uri.length <= 2000, `URI length ${uri.length} exceeds 2000`);
    assert.match(uri, /^vrcae:\/\/bulk-item-import\?v=1&item_id=12345&items=/);
  }
  // チャンク間に 750ms の遅延が入ること
  assert.equal(delays.length, env.launched.length - 1);
  assert(delays.every(d => d === 750), 'All inter-chunk delays should be 750ms');
  assert.equal(env.history.length, count);
});

test('BOOTH Library Manager launchBulk enforces 750ms interval between schemas', async () => {
  const pairs = [
    [normal(101), deeplink(101)],
    [normal(102), deeplink(102)],
    [normal(103), deeplink(103)]
  ];
  const delays = [];
  const customTimeout = (fn, ms) => {
    delays.push(ms);
    return setImmediate(fn);
  };
  const env = setup(pairs, false, customTimeout);
  env.change('booth-library-manager');

  await env.window.assetConnectDefaultDownload.launchBulk(env.regulars);

  assert.equal(env.launched.length, 3);
  assert.equal(delays.length, 2);
  assert(delays.every(d => d === 750), 'All schema launch delays should be 750ms');
});

test('AvatarExplorer bulk download JSON contains no formatting whitespace (compact JSON)', () => {
  const env = setup([[normal(101), deeplink(101)]]);
  const defaultDownload = env.window.assetConnectDefaultDownload;

  const item = [{
    variation_id: ' 789 ',
    downloadable_filename: '  Avatar.zip  ',
    dlurl: ' https://booth.pm/downloadables/101 '
  }];
  const url = defaultDownload.buildBulkItemImportUrl('123456', [{
    variation_id: item[0].variation_id.trim(),
    downloadable_filename: item[0].downloadable_filename.trim(),
    dlurl: item[0].dlurl.trim()
  }]);

  const rawItemsParam = new URL(url).searchParams.get('items');
  // 整形用の空白文字（スペース、タブ、改行）が含まれていないことを確認
  assert.equal(rawItemsParam.includes(': '), false);
  assert.equal(rawItemsParam.includes(', '), false);
  assert.equal(rawItemsParam.includes('\n'), false);
  assert.equal(rawItemsParam.includes('\r'), false);
  assert.equal(rawItemsParam, '[{"variation_id":"789","downloadable_filename":"Avatar.zip","dlurl":"https://booth.pm/downloadables/101"}]');
});

test('AvatarExplorer v0 bulk import format works and enforces 750ms interval', async () => {
  const pairs = [
    [normal(101), deeplink(101)],
    [normal(102), deeplink(102)],
    [normal(103), deeplink(103)]
  ];
  const delays = [];
  const customTimeout = (fn, ms) => {
    delays.push(ms);
    return setImmediate(fn);
  };
  const env = setup(pairs, false, customTimeout);
  env.change('avatar-explorer');

  // デフォルトは 'v0'
  assert.equal(env.window.assetConnectDefaultDownload.getAeBulkFormat(), 'v0');

  // 'v1' に変更できることを確認
  env.changeAeBulkFormat('v1');
  assert.equal(env.window.assetConnectDefaultDownload.getAeBulkFormat(), 'v1');

  // 'v0' に戻す
  env.changeAeBulkFormat('v0');
  assert.equal(env.window.assetConnectDefaultDownload.getAeBulkFormat(), 'v0');

  let progress = [];
  await env.window.assetConnectDefaultDownload.launchBulk(env.regulars, (p, t) => {
    progress.push({ p, t });
  });

  // v0形式では各アイテムごとに個別のdeeplink（vrcae:test）が起動される
  assert.equal(env.launched.length, 3);
  assert.equal(env.launched[0], 'vrcae:test');
  assert.equal(env.launched[1], 'vrcae:test');
  assert.equal(env.launched[2], 'vrcae:test');

  // 起動間隔は 750ms
  assert.equal(delays.length, 2);
  assert(delays.every(d => d === 750), 'All v0 schema launch delays should be 750ms');

  // 履歴も全件保存される
  assert.equal(env.history.length, 3);
  assert(env.history.every(h => h.registered === true));

  // 進捗コールバック
  assert.deepEqual(progress, [
    { p: 1, t: 3 },
    { p: 2, t: 3 },
    { p: 3, t: 3 }
  ]);
});



