/**
 * @jest-environment node
 */

global.chrome = {
  runtime: {
    sendMessage: jest.fn(),
    onMessage: { addListener: jest.fn() },
    id: 'test'
  }
};

const { fetchPlayerId, generateConfigFromPlayers } = require('../background');

describe('fetchPlayerId', () => {
  afterEach(() => {
    jest.resetAllMocks();
    delete global.fetch;
  });

  test('returns player ID on success', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ people: [{ id: 12345 }] })
    });
    const id = await fetchPlayerId('Test Player');
    expect(id).toBe('12345');
    expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith({ action: 'updateStatus', text: 'Fetching ID for Test Player...' });
  });

  test('throws error when response not ok', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });
    await expect(fetchPlayerId('Bad Player')).rejects.toThrow('API request failed for Bad Player with status 500');
  });

  test('returns null when player not found', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ people: [] })
    });
    const id = await fetchPlayerId('Unknown');
    expect(id).toBeNull();
  });
});

describe('generateConfigFromPlayers', () => {
  afterEach(() => {
    jest.resetAllMocks();
    delete global.fetch;
  });

  test('generates config with fetched IDs', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ people: [{ id: 1 }] })
    });
    const players = [{ name: 'Player One', position: 'OF' }];
    const base = JSON.stringify({ priority: [] });
    const result = await generateConfigFromPlayers(players, base);
    expect(result.priority).toEqual([
      { type: 'bat', data: '1', immediate: '', priority: 1 }
    ]);
  });

  test('skips players without IDs and adds valid ones', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ people: [{ id: 1 }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ people: [] }) });

    const players = [
      { name: 'Good Player', position: 'OF' },
      { name: 'Missing Player', position: 'SP' }
    ];
    const base = JSON.stringify({ priority: [] });
    const result = await generateConfigFromPlayers(players, base);
    expect(result.priority).toHaveLength(1);
    expect(result.priority[0].data).toBe('1');
  });

  test('throws error when base config invalid', async () => {
    const players = [{ name: 'Player One', position: 'OF' }];
    await expect(generateConfigFromPlayers(players, 'not json')).rejects.toThrow('Invalid base configuration format');
  });

  test('throws error when no players added', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ people: [] }) });
    const players = [{ name: 'Unknown', position: 'OF' }];
    const base = JSON.stringify({ priority: [] });
    await expect(generateConfigFromPlayers(players, base)).rejects.toThrow('Could not find/add any of the selected players');
  });
});
