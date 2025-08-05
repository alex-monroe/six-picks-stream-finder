/**
 * @jest-environment node
 */

describe('background message handling', () => {
  let handler;
  let storedConfig;

  beforeEach(() => {
    jest.resetModules();
    storedConfig = undefined;
    global.chrome = {
      runtime: {
        sendMessage: jest.fn(),
        onMessage: {
          addListener: jest.fn(fn => {
            handler = fn;
          })
        },
        id: 'test',
        lastError: undefined
      },
      storage: {
        session: {
          set: jest.fn((obj, cb) => {
            storedConfig = obj.baseConfig;
            cb && cb();
          }),
          get: jest.fn((key, cb) => {
            cb && cb({ baseConfig: storedConfig });
          }),
          remove: jest.fn((key, cb) => {
            storedConfig = undefined;
            cb && cb();
          })
        }
      }
    };

    jest.isolateModules(() => {
      require('../background');
    });
  });

  afterEach(() => {
    delete global.chrome;
    delete global.fetch;
  });

  test('stores base config when setBaseConfigContext received', () => {
    const sendResponse = jest.fn();
    const message = { action: 'setBaseConfigContext', baseConfig: JSON.stringify({ priority: [] }) };
    handler(message, { id: 'popup', url: 'about:blank' }, sendResponse);
    expect(sendResponse).toHaveBeenCalledWith({ status: 'ok' });
    expect(storedConfig).toBe(JSON.stringify({ priority: [] }));
  });

  test('processPlayers generates config and sends downloadFile', async () => {
    const sendResponse = jest.fn();
    // seed base config
    handler(
      { action: 'setBaseConfigContext', baseConfig: JSON.stringify({ priority: [] }) },
      { id: 'popup', url: 'about:blank' },
      jest.fn()
    );

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ people: [{ id: 1 }] })
    });

    handler(
      { action: 'processPlayers', players: [{ name: 'Player', position: 'OF' }] },
      { id: 'content', url: 'https://example.com' },
      sendResponse
    );

    await new Promise(setImmediate);

    expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'downloadFile', filename: expect.any(String) })
    );
    expect(sendResponse).toHaveBeenCalledWith({ status: 'Config generated and sent for download' });
  });

  test('processPlayers reports error when base config missing', async () => {
    const sendResponse = jest.fn();
    handler({ action: 'processPlayers', players: [] }, { id: 'content', url: 'https://example.com' }, sendResponse);

    await new Promise(setImmediate);

    expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'displayError', error: expect.stringContaining('Base config context missing') })
    );
    expect(sendResponse).toHaveBeenCalledWith({ status: 'Error', error: 'Base config context missing' });
  });

  test('extractionFailed forwards error and clears context', () => {
    storedConfig = 'something';
    const sendResponse = jest.fn();
    handler({ action: 'extractionFailed', error: 'bad' }, { id: 'content', url: 'https://example.com' }, sendResponse);
    expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith({ action: 'displayError', error: 'Extraction Error: bad' });
    expect(storedConfig).toBeUndefined();
    expect(sendResponse).toHaveBeenCalledWith({ status: 'Extraction error forwarded' });
  });
});
