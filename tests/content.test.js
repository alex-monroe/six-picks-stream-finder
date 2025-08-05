/**
 * @jest-environment jsdom
 */

const { extractPlayerPicks } = require('../content');

describe('extractPlayerPicks', () => {
  test('returns null when table is missing', () => {
    document.body.innerHTML = '<div id="content"></div>';
    expect(extractPlayerPicks()).toBeNull();
  });

  test('extracts players from table', () => {
    document.body.innerHTML = `
      <div id="content"><div class="wideleft"><table><tbody>
        <tr><td>OF</td><td><a href="/playercard/1">Player One</a></td></tr>
        <tr><td>SP</td><td><a href="/playercard/2">Player Two</a></td></tr>
      </tbody></table></div></div>`;
    const players = extractPlayerPicks();
    expect(players).toEqual([
      { name: 'Player One', position: 'OF' },
      { name: 'Player Two', position: 'SP' }
    ]);
  });

  test('skips rows without valid data', () => {
    document.body.innerHTML = `
      <div id="content"><div class="wideleft"><table><tbody>
        <tr><td>OF</td><td></td></tr>
        <tr><td></td><td><a href="/playercard/3">NoPos</a></td></tr>
        <tr><td>RP</td><td><a href="/playercard/4">Valid</a></td></tr>
      </tbody></table></div></div>`;
    const players = extractPlayerPicks();
    expect(players).toEqual([{ name: 'Valid', position: 'RP' }]);
  });
});
