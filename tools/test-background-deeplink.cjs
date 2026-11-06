const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(require('node:path').join(__dirname, '../background/background.js'), 'utf8');

for (const firefox of [false, true]) {
  test(`deeplink redirect capture (${firefox ? 'Firefox' : 'Chromium'})`, async () => {
    let headersListener, headerOptions, messageListener;
    const event = () => ({ addListener() {} });
    const chrome = {
      runtime: { onInstalled: event(), onStartup: event(), onMessage: {
        addListener(listener) { messageListener = listener; }
      } },
      contextMenus: { onClicked: event() },
      storage: { local: { get: async () => ({}) } },
      permissions: { contains: async () => true },
      webRequest: {
        onBeforeRedirect: event(),
        onHeadersReceived: { addListener(listener, filter, options) {
          headersListener = listener;
          headerOptions = options;
        } }
      },
      tabs: { sendMessage: async (tabId, request) => {
        headersListener({ url: request.requestUrl, statusCode: 302,
          responseHeaders: [{ name: 'Location', value: 'booth-library-manager://import?token=test' }] });
      } }
    };
    vm.runInNewContext(source, {
      chrome, navigator: { userAgent: firefox ? 'Firefox/145' : 'Chrome/156' },
      URL, crypto: { randomUUID: () => 'test-request' }, setTimeout, clearTimeout, console
    });
    assert.deepEqual(Array.from(headerOptions), firefox
      ? ['blocking', 'responseHeaders'] : ['responseHeaders', 'extraHeaders']);
    const response = await new Promise(resolve => {
      assert.equal(messageListener({ action: 'fetchAvatarExplorerDeeplink',
        deeplinkUrl: 'https://booth.pm/downloadables/123/deeplink?client=booth-library-manager'
      }, { tab: { id: 1 } }, resolve), true);
    });
    assert.equal(response.success, true);
    if (!firefox) assert.equal(response.deeplink, 'vrcae://import?token=test');
    else assert.equal(response.launchMode, 'firefox-navigation-redirect');
  });
}
