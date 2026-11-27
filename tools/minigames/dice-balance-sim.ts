/**
 * «Кости войны»: симуляция баланса бойцов игрока.
 * bun tools/minigames/dice-balance-sim.ts [боёв на бойца]
 * Игрок играет жадно (крит → обычная атака → защита), ульта — в первый свой ход; бой до поражения (макс. 15 побед).
 */
import { DEFAULT_MINIGAME_SETTINGS, ENEMY_FIGHTERS, PLAYER_FIGHTERS } from '../../backend/src/config/minigames';
import {
  createDicePools,
  playDicePoolTurn,
  resolveDiceInitiative,
  seededRandom,
  startDiceBattle,
  type DicePoolAction,
} from '../../backend/src/modules/minigames/rules';

const N = Number(process.argv[2] ?? 4000);
const params = DEFAULT_MINIGAME_SETTINGS.games.dice.params;
const rng = seededRandom(12345);

function playerAction(state: any): DicePoolAction {
  const player = PLAYER_FIGHTERS.find((f) => f.id === state.playerId)!;
  const pool = state.pools?.player ?? [];
  if (!state.usedUlt) return 'ult';
  if (pool.some((e: any) => !e.used && e.value === 6)) return 'critical';
  if (pool.some((e: any) => !e.used && e.value !== 6 && e.value >= player.skill)) return 'attack';
  return 'defend';
}

import { chooseEnemyPoolAction } from '../../backend/src/modules/minigames/rules';

const rows: string[] = [];
for (const fighter of PLAYER_FIGHTERS) {
  let total = 0;
  let atLeast3 = 0;
  let atLeast5 = 0;
  for (let i = 0; i < N; i++) {
    let state: any = startDiceBattle([fighter], ENEMY_FIGHTERS, rng);
    state = resolveDiceInitiative(state, rng() < 0.5 ? 'even' : 'odd', rng).state;
    state.pools = createDicePools(state, PLAYER_FIGHTERS, ENEMY_FIGHTERS, params, rng);
    let guard = 0;
    while (!state.finished && state.wins < 15 && guard++ < 2000) {
      const action = state.turn === 'enemy' ? chooseEnemyPoolAction(state, PLAYER_FIGHTERS, ENEMY_FIGHTERS, params) : playerAction(state);
      try {
        state = playDicePoolTurn(state, action, PLAYER_FIGHTERS, ENEMY_FIGHTERS, params, rng).state;
      } catch {
        state = playDicePoolTurn(state, 'defend', PLAYER_FIGHTERS, ENEMY_FIGHTERS, params, rng).state;
      }
      if (!state.finished && state.pools === null) state.pools = createDicePools(state, PLAYER_FIGHTERS, ENEMY_FIGHTERS, params, rng);
    }
    total += state.wins;
    if (state.wins >= 3) atLeast3++;
    if (state.wins >= 5) atLeast5++;
  }
  rows.push(`${fighter.name.padEnd(8)} ${fighter.id.padEnd(15)} avg wins ${(total / N).toFixed(2).padStart(5)}  ≥3: ${((atLeast3 / N) * 100).toFixed(0).padStart(3)}%  ≥5: ${((atLeast5 / N) * 100).toFixed(0).padStart(3)}%`);
}
console.log(rows.join('\n'));
