export interface BattleConfigData {
  maxRounds: number;
  initialReputation: number;
  initialHandSize: number;
  maxHandSize: number;
  actionPointsPerTurn: number;
  boardSlots: number;
  strategySlots: number;
}

export const BattleConfig: BattleConfigData = {
  maxRounds: 5,
  initialReputation: 20,
  initialHandSize: 4,
  maxHandSize: 7,
  actionPointsPerTurn: 3,
  boardSlots: 3,
  strategySlots: 2,
};
