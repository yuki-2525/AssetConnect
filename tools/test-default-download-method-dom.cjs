// Requires jsdom (available via NODE_PATH or a local installation).
// Optionally set ASSETCONNECT_TEST_HTML to test a saved BOOTH page as well.
// Run: node --test tools/test-default-download-method-dom.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync(path.join(__dirname, '../shared/default-download-method.js'), 'utf8');
const row = id => `<div class="desktop:flex"><div class="text-14">file-${id}.zip</div>
  <div><div><div class="js-download-button" data-test="downloadable"
    data-label="ダウンロード" data-href="https://booth.pm/downloadables/${id}">
    <div><button><div><pixiv-icon></pixiv-icon>ダウンロード</div></button></div>
  </div></div><div><div class="js-download-button" data-test="other-downloads-button"
    data-dropdown-items='[{"deeplinkDownloadableUrl":"https://booth.pm/downloadables/${id}/deeplink?client=booth-library-manager&variation_id=7"}]'>
    <button>その他のDL方法</button><div class="absolute top-full">
      <div class="cursor-pointer"><pixiv-icon></pixiv-icon>BOOTH Library ManagerでDL</div>
    </div>
  </div></div></div></div>`;
const fixtures = [['download rows', row(101) + row(102)]];
if (process.env.ASSETCONNECT_TEST_HTML) {
  fixtures.push(['provided HTML', fs.readFileSync(process.env.ASSETCONNECT_TEST_HTML, 'utf8')]);
}

for (const [name, html] of fixtures) {
  test(`${name}: settings, click targets and page text updates`, async () => {
    const dom = new JSDOM(html, { url: 'https://accounts.booth.pm/library', runScripts: 'outside-only' });
    const w = dom.window;
    const observers = [], launched = [], requests = [];
    const Observer = w.MutationObserver;
    w.MutationObserver = class extends Observer {
      constructor(callback) { super(callback); observers.push(this); }
    };
    let change;
    w.HTMLAnchorElement.prototype.click = function () { launched.push(this.href); };
    w.alert = message => assert.fail(message);
    w.chrome = {
      i18n: { getMessage: () => '' },
      storage: {
        local: { get: (_, callback) => callback({ defaultDownloadMethod: 'avatar-explorer' }) },
        onChanged: { addListener: callback => { change = callback; } }
      },
      runtime: {
        onMessage: { addListener() {} },
        sendMessage: async request => { requests.push(request); return { success: true, deeplink: 'vrcae:test' }; }
      }
    };
    const flush = () => new Promise(resolve => setImmediate(resolve));
    try {
      w.eval(source);
      await flush();
      const regulars = [...w.document.querySelectorAll('[data-test="downloadable"]')];
      assert(regulars.length > 1);
      for (const regular of regulars) {
        const button = regular.querySelector('button');
        assert.equal(button.textContent.trim(), 'AvatarExplorerでダウンロード');
        button.click();
        await flush();
        const expectedPath = new URL(regular.dataset.href).pathname + '/deeplink';
        assert.equal(new URL(requests.at(-1).deeplinkUrl).pathname, expectedPath);
        await w.assetConnectDefaultDownload.launchForRegular(regular);
        assert.equal(new URL(requests.at(-1).deeplinkUrl).pathname, expectedPath);
      }

      // React-style text updates keep the same Text node and emit characterData.
      for (const regular of regulars) {
        const button = regular.querySelector('button');
        const walker = w.document.createTreeWalker(button, w.NodeFilter.SHOW_TEXT);
        let text;
        while ((text = walker.nextNode())) {
          if (text.textContent.includes('AvatarExplorer')) { text.data = 'ダウンロード'; break; }
        }
      }
      await flush();
      regulars.forEach(regular => assert.equal(regular.querySelector('button').textContent.trim(), 'AvatarExplorerでダウンロード'));

      change({ defaultDownloadMethod: { newValue: 'booth-library-manager' } }, 'local');
      await flush();
      regulars.forEach(regular => assert.equal(regular.querySelector('button').textContent.trim(), 'BOOTH Library Managerでダウンロード'));
      change({ defaultDownloadMethod: { newValue: 'normal' } }, 'local');
      await flush();
      regulars.forEach(regular => assert.equal(regular.querySelector('button').textContent.trim(), 'ダウンロード'));
      assert.equal(w.document.querySelectorAll('.asset-connect-normal-download').length, 0);
      assert(requests.length >= regulars.length * 2);
      assert(launched.length >= regulars.length * 2);
    } finally {
      observers.forEach(observer => observer.disconnect());
      w.close();
    }
  });
}
