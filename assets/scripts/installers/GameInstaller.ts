import { Arch } from '../framework/Arch';
import { GameModel } from '../models/GameModel';
import { BattleModel } from '../models/BattleModel';

export class GameInstaller {
  static install() {
    const existing = Arch.get<GameModel>('GameModel');
    if (existing) return existing;

    const game = new GameModel();
    if (game.onInit) {
      game.onInit();
    }
    Arch.register(game);

    const battle = new BattleModel();
    if (battle.onInit) {
      battle.onInit();
    }
    Arch.register(battle);

    return game;
  }
}
