import { Model } from '../framework/Model';
import { EventBus } from '../framework/EventBus';

export interface RoundResult {
  round: number;
  playerPower: number;
  enemyPower: number;
  winner: 'player' | 'enemy' | 'draw';
}

export class GameModel extends Model {
  readonly key = 'GameModel';

  score = 0;
  round = 0;
  playerName = '玩家';
  enemyName = '对手';
  lastResult: RoundResult | null = null;

  startRound(playerPower: number, enemyPower: number) {
    this.round += 1;
    let winner: RoundResult['winner'] = 'draw';
    if (playerPower > enemyPower) {
      winner = 'player';
      this.score += 1;
    } else if (playerPower < enemyPower) {
      winner = 'enemy';
      this.score -= 1;
    }

    this.lastResult = {
      round: this.round,
      playerPower,
      enemyPower,
      winner,
    };

    EventBus.emit('game:round_changed', this.lastResult);
    EventBus.emit('game:score_changed', this.score);
  }
}
