export type CardCamp = 'hotspot' | 'moderation' | 'evidence' | 'neutral';
export type CardType = 'unit' | 'event' | 'strategy';
export type CardRarity = 'common' | 'rare' | 'epic' | 'legendary';
export type EffectTrigger =
  | 'on_play'
  | 'on_turn_start'
  | 'on_turn_end'
  | 'on_attack'
  | 'on_damaged'
  | 'on_death'
  | 'passive';

export type EffectActionType =
  | 'gain_heat'
  | 'lose_heat'
  | 'draw'
  | 'discard'
  | 'deal_damage_unit'
  | 'deal_damage_player'
  | 'heal_player'
  | 'add_evidence'
  | 'apply_keyword'
  | 'modify_attack'
  | 'modify_cost'
  | 'destroy_unit'
  | 'scry_draw'
  | 'grant_shield';

export type EffectTarget = 'self' | 'ally_unit' | 'enemy_unit' | 'enemy_player' | 'all_enemy_units';

export type EffectConditionType =
  | 'has_friendly_camp_unit'
  | 'controller_has_camp_unit'
  | 'heat_at_least'
  | 'target_has_evidence_at_least'
  | 'played_event_this_turn'
  | 'enemy_gained_heat_this_turn';

export interface EffectCondition {
  type: EffectConditionType;
  value?: number;
  camp?: CardCamp;
}

export interface EffectAction {
  type: EffectActionType;
  value?: number;
  target?: EffectTarget;
  keyword?: string;
  extra?: string;
}

export interface CardEffect {
  trigger: EffectTrigger;
  conditions?: EffectCondition[];
  actions: EffectAction[];
  description: string;
}

export interface CardDefinition {
  id: string;
  name: string;
  camp: CardCamp;
  type: CardType;
  rarity: CardRarity;
  cost: number;
  attack?: number;
  health?: number;
  deckLimit: number;
  tags: string[];
  text: string;
  effects: CardEffect[];
}

export interface CardLibraryData {
  version: string;
  cards: CardDefinition[];
}
