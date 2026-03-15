import { Model } from '../framework/Model';
import { EventBus } from '../framework/EventBus';
import { BattleConfig } from '../data/BattleConfig';
import { CardDefinition, CardEffect, EffectAction, EffectCondition } from '../data/CardTypes';
import { CardLibrary } from '../data/CardLibrary';
import { DeckPresets } from '../data/DeckPresets';

export type BattleTurn = 'player' | 'enemy';
export type BattlePhase = 'idle' | 'draw' | 'main' | 'battle' | 'finished';

export interface BattleCardInstance {
  instanceId: string;
  cardId: string;
  definition: CardDefinition;
  currentAttack?: number;
  currentHealth?: number;
  evidence?: number;
  exhausted?: boolean;
  shields?: number;
  silenced?: boolean;
  attackBlocked?: boolean;
  silenceExpiresOnTurnEnd?: BattleTurn;
  attackBlockedExpiresOnTurnEnd?: BattleTurn;
  attackModifierExpiresOnTurnEnd?: BattleTurn;
  baseAttackBeforeTemporaryModifier?: number;
  attackModifierExpiresAfterAttack?: boolean;
  eventPassiveAppliedThisTurn?: boolean;
}

export interface BattleSideState {
  reputation: number;
  heat: number;
  actionPoints: number;
  eventPlayedThisTurn: boolean;
  gainedHeatThisTurn: boolean;
  attackedThisTurn: boolean;
  enemyReceivedEvidenceThisTurn: boolean;
  enemyUnitSkillTriggeredThisTurn: boolean;
  heatDamageTriggersThisTurn: number;
  nextHeatGainReduction: number;
  firstHeatGainReduction: number;
  firstHeatGainConsumed: boolean;
  nextEventCostModifier: number;
  firstEventCostModifier: number;
  firstEventCostConsumed: boolean;
  deck: BattleCardInstance[];
  hand: BattleCardInstance[];
  discard: BattleCardInstance[];
  board: Array<BattleCardInstance | null>;
  strategies: Array<BattleCardInstance | null>;
}

export interface PlayCardResult {
  ok: boolean;
  reason?: string;
  card?: BattleCardInstance;
}

export interface AttackResult {
  ok: boolean;
  reason?: string;
  attacker?: BattleCardInstance;
  defender?: BattleCardInstance | null;
  direct?: boolean;
}

export class BattleModel extends Model {
  readonly key = 'BattleModel';

  maxRounds = 5;
  round = 1;
  phase: BattlePhase = 'idle';
  currentTurn: BattleTurn = 'player';
  playerDeckId = 'hotspot_aggro';
  enemyDeckId = 'moderation_control';
  playerState: BattleSideState = this.createEmptySideState();
  enemyState: BattleSideState = this.createEmptySideState();

  private _instanceSeed = 1;

  private createEmptySideState(): BattleSideState {
    return {
      reputation: BattleConfig.initialReputation,
      heat: 0,
      actionPoints: BattleConfig.actionPointsPerTurn,
      eventPlayedThisTurn: false,
      gainedHeatThisTurn: false,
      attackedThisTurn: false,
      enemyReceivedEvidenceThisTurn: false,
      enemyUnitSkillTriggeredThisTurn: false,
      heatDamageTriggersThisTurn: 0,
      nextHeatGainReduction: 0,
      firstHeatGainReduction: 0,
      firstHeatGainConsumed: false,
      nextEventCostModifier: 0,
      firstEventCostModifier: 0,
      firstEventCostConsumed: false,
      deck: [],
      hand: [],
      discard: [],
      board: Array.from({ length: BattleConfig.boardSlots }, () => null),
      strategies: Array.from({ length: BattleConfig.strategySlots }, () => null),
    };
  }

  private nextInstanceId(prefix: BattleTurn) {
    const id = `${prefix}_${this._instanceSeed}`;
    this._instanceSeed += 1;
    return id;
  }

  private buildDeck(actor: BattleTurn): BattleCardInstance[] {
    const deckId = actor === 'player' ? this.playerDeckId : this.enemyDeckId;
    const preset = DeckPresets.find((d) => d.id === deckId);
    const cardMap = new Map(CardLibrary.cards.map((c) => [c.id, c]));
    const cardIds = preset ? preset.cards : CardLibrary.cards.slice(0, 12).map((c) => c.id);
    const cards = cardIds
      .map((id) => cardMap.get(id))
      .filter((d): d is NonNullable<typeof d> => !!d)
      .map((definition) => ({
        instanceId: this.nextInstanceId(actor),
        cardId: definition.id,
        definition,
        currentAttack: definition.attack,
        currentHealth: definition.health,
        evidence: 0,
        exhausted: false,
        shields: 0,
        silenced: false,
        attackBlocked: false,
        silenceExpiresOnTurnEnd: undefined,
        attackBlockedExpiresOnTurnEnd: undefined,
        attackModifierExpiresOnTurnEnd: undefined,
        baseAttackBeforeTemporaryModifier: undefined,
        attackModifierExpiresAfterAttack: false,
        eventPassiveAppliedThisTurn: false,
      } as BattleCardInstance));
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return cards;
  }

  private drawCards(side: BattleSideState, amount: number) {
    for (let i = 0; i < amount; i++) {
      if (side.deck.length === 0 && side.discard.length > 0) {
        side.deck = side.discard.splice(0);
        for (let j = side.deck.length - 1; j > 0; j--) {
          const k = Math.floor(Math.random() * (j + 1));
          [side.deck[j], side.deck[k]] = [side.deck[k], side.deck[j]];
        }
      }
      const next = side.deck.shift();
      if (!next) break;
      if (side.hand.length >= BattleConfig.maxHandSize) {
        side.discard.push(next);
      } else {
        side.hand.push(next);
      }
    }
  }

  getSideState(turn: BattleTurn) {
    return turn === 'player' ? this.playerState : this.enemyState;
  }

  getOpponentState(turn: BattleTurn) {
    return turn === 'player' ? this.enemyState : this.playerState;
  }

  beginTurn(turn: BattleTurn) {
    this.currentTurn = turn;
    this.phase = 'draw';

    const side = this.getSideState(turn);
    const opponent = this.getOpponentState(turn);
    side.actionPoints = BattleConfig.actionPointsPerTurn;
    side.eventPlayedThisTurn = false;
    side.gainedHeatThisTurn = false;
    side.attackedThisTurn = false;
    side.enemyReceivedEvidenceThisTurn = false;
    side.enemyUnitSkillTriggeredThisTurn = false;
    side.heatDamageTriggersThisTurn = 0;
    side.nextHeatGainReduction = 0;
    side.firstHeatGainReduction = 0;
    side.firstHeatGainConsumed = false;
    side.nextEventCostModifier = 0;
    side.firstEventCostModifier = 0;
    side.firstEventCostConsumed = false;
    opponent.firstEventCostModifier = 0;
    opponent.firstEventCostConsumed = false;
    opponent.gainedHeatThisTurn = false;
    opponent.enemyReceivedEvidenceThisTurn = false;
    opponent.enemyUnitSkillTriggeredThisTurn = false;
    opponent.firstHeatGainReduction = 0;
    opponent.firstHeatGainConsumed = false;
    side.board.forEach((unit) => {
      if (!unit) return;
      unit.exhausted = false;
      unit.eventPassiveAppliedThisTurn = false;
    });

    this.refreshPassiveCostModifiers();
    this.drawCards(side, 1);
    this.executeTriggeredEffects(turn, 'on_turn_start');
    this.phase = 'main';
    EventBus.emit('battle:updated', this.snapshot());
  }

  endTurn() {
    this.executeTriggeredEffects(this.currentTurn, 'on_turn_end');
    this.expireTimedUnitStates(this.currentTurn);
    this.playerState.nextHeatGainReduction = 0;
    this.enemyState.nextHeatGainReduction = 0;
    if (this.phase === 'finished') {
      return;
    }
    const nextTurn = this.currentTurn === 'player' ? 'enemy' : 'player';
    if (nextTurn === 'player') {
      this.round += 1;
      if (this.round > this.maxRounds) {
        this.phase = 'finished';
        EventBus.emit('battle:finished', this.snapshot());
        return;
      }
    }
    this.beginTurn(nextTurn);
  }

  private findOpenSlot(slots: Array<BattleCardInstance | null>) {
    return slots.findIndex((slot) => slot === null);
  }

  private refreshPassiveCostModifiers() {
    this.playerState.firstEventCostModifier = 0;
    this.enemyState.firstEventCostModifier = 0;
    this.playerState.firstHeatGainReduction = 0;
    this.enemyState.firstHeatGainReduction = 0;

    const applyPassiveTaxes = (actor: BattleTurn) => {
      const side = this.getSideState(actor);
      const cards = [
        ...side.board.filter((card): card is BattleCardInstance => !!card),
        ...side.strategies.filter((card): card is BattleCardInstance => !!card),
      ];

      cards.forEach((card) => {
        if (card.silenced && card.definition.type === 'unit') {
          return;
        }
        card.definition.effects.forEach((effect) => {
          if (effect.trigger !== 'passive') return;
          effect.actions.forEach((action) => {
            if (action.type !== 'modify_cost') return;
            if (action.extra !== 'first_event_each_turn') return;
            if (action.target !== 'enemy_player') return;
            const opponent = this.getOpponentState(actor);
            opponent.firstEventCostModifier += action.value ?? 0;
          });

          effect.actions.forEach((action) => {
            if (action.type !== 'lose_heat') return;
            if (action.extra !== 'first_gain_each_turn') return;
            if (action.target !== 'enemy_player') return;
            const opponent = this.getOpponentState(actor);
            opponent.firstHeatGainReduction += action.value ?? 0;
          });
        });
      });
    };

    applyPassiveTaxes('player');
    applyPassiveTaxes('enemy');
  }

  private getPlayCost(side: BattleSideState, card: BattleCardInstance) {
    let cost = card.definition.cost;
    if (card.definition.type === 'event') {
      if (!side.firstEventCostConsumed) {
        cost += side.firstEventCostModifier;
      }
      cost += side.nextEventCostModifier;
    }
    return Math.max(0, cost);
  }

  private hasAnyEvidenceOnBoard() {
    return [...this.playerState.board, ...this.enemyState.board].some((unit) => !!unit && (unit.evidence ?? 0) > 0);
  }

  private removeHandCard(side: BattleSideState, instanceId: string) {
    const index = side.hand.findIndex((card) => card.instanceId === instanceId);
    if (index < 0) return null;
    const [card] = side.hand.splice(index, 1);
    return card;
  }

  private spendActionPoint(side: BattleSideState, cost: number) {
    if (side.actionPoints < cost) {
      return false;
    }
    side.actionPoints -= cost;
    return true;
  }

  private clampHeat(value: number) {
    return Math.max(0, value);
  }

  private getSingleTarget(side: BattleSideState, target: EffectAction['target']) {
    if (target === 'ally_unit') {
      return side.board.find((unit) => unit) ?? null;
    }
    if (target === 'enemy_unit') {
      return null;
    }
    return null;
  }

  private targetHasEvidenceAtLeast(side: BattleSideState, value: number, target: EffectAction['target'], preferredTargetId?: string) {
    if (target === 'enemy_unit') {
      if (preferredTargetId) {
        const targetUnit = side.board.find((unit) => unit?.instanceId === preferredTargetId);
        return (targetUnit?.evidence ?? 0) >= value;
      }
      return side.board.some((unit) => !!unit && (unit.evidence ?? 0) >= value);
    }
    return false;
  }

  private evaluateCondition(actor: BattleTurn, condition: EffectCondition, actionTarget?: EffectAction['target'], preferredTargetId?: string) {
    const side = this.getSideState(actor);
    switch (condition.type) {
      case 'has_friendly_camp_unit':
      case 'controller_has_camp_unit':
        return side.board.some((unit) => !!unit && unit.definition.camp === condition.camp);
      case 'heat_at_least':
        return side.heat >= (condition.value ?? 0);
      case 'target_has_evidence_at_least':
        return this.targetHasEvidenceAtLeast(this.getOpponentState(actor), condition.value ?? 0, actionTarget, preferredTargetId);
      case 'played_event_this_turn':
        return side.eventPlayedThisTurn;
      case 'enemy_gained_heat_this_turn':
        return this.getOpponentState(actor).gainedHeatThisTurn;
      default:
        return true;
    }
  }

  private resolveCardTarget(actor: BattleTurn, target: EffectAction['target'], preferredTargetId?: string, selfUnitId?: string) {
    const side = this.getSideState(actor);
    const opponent = this.getOpponentState(actor);
    if (target === 'self') {
      if (selfUnitId) {
        const unit = side.board.find((u) => u?.instanceId === selfUnitId);
        if (unit) return unit;
      }
      return side;
    }
    if (target === 'enemy_player') return opponent;
    if (target === 'ally_unit') {
      if (preferredTargetId) {
        return side.board.find((unit) => unit?.instanceId === preferredTargetId) ?? side.board.find((unit) => unit) ?? null;
      }
      return side.board.find((unit) => unit) ?? null;
    }
    if (target === 'enemy_unit') {
      if (preferredTargetId) {
        return opponent.board.find((unit) => unit?.instanceId === preferredTargetId) ?? opponent.board.find((unit) => unit) ?? null;
      }
      return opponent.board.find((unit) => unit) ?? null;
    }
    if (target === 'all_enemy_units') return opponent.board.filter((unit) => unit) as BattleCardInstance[];
    return null;
  }

  private destroyUnit(actor: BattleTurn, targetUnit: BattleCardInstance | null) {
    if (!targetUnit) return;
    const opponent = this.getOpponentState(actor);
    const index = opponent.board.findIndex((unit) => unit?.instanceId === targetUnit.instanceId);
    if (index >= 0) {
      opponent.board[index] = null;
      opponent.discard.push(targetUnit);
    }
  }

  private cleanupDeadUnits() {
    [this.playerState, this.enemyState].forEach((side) => {
      side.board.forEach((unit, index) => {
        if (!unit) return;
        if ((unit.currentHealth ?? unit.definition.health ?? 0) > 0) return;
        side.board[index] = null;
        side.discard.push(unit);
      });
    });
  }

  private applyImmediateEventStatePassives(actor: BattleTurn, card: BattleCardInstance) {
    const side = this.getSideState(actor);
    if (!side.eventPlayedThisTurn) {
      return;
    }
    if (card.silenced && card.definition.type === 'unit') {
      return;
    }

    card.definition.effects.forEach((effect) => {
      if (effect.trigger !== 'passive') return;
      const needsPlayedEvent = (effect.conditions ?? []).some((condition) => condition.type === 'played_event_this_turn');
      if (!needsPlayedEvent) return;
      effect.actions.forEach((action) => {
        if (card.cardId === 'hotspot_002' && action.type === 'modify_attack' && !card.eventPassiveAppliedThisTurn) {
          this.applyAction(actor, { ...action, extra: 'until_end_of_turn' }, undefined, card.instanceId);
          card.eventPassiveAppliedThisTurn = true;
        }
      });
    });
  }

  private triggerEnemyUnitSkillPassives(actor: BattleTurn, sourceCard: BattleCardInstance) {
    if (sourceCard.definition.type !== 'unit') {
      return;
    }

    const opponentTurn = actor === 'player' ? 'enemy' : 'player';
    const opponent = this.getSideState(opponentTurn);
    if (opponent.enemyUnitSkillTriggeredThisTurn) {
      return;
    }

    const cards = this.getActiveCards(opponent);
    cards.forEach((card) => {
      if (card.silenced && card.definition.type === 'unit') {
        return;
      }
      card.definition.effects.forEach((effect) => {
        if (effect.trigger !== 'passive') return;
        effect.actions.forEach((action) => {
          if (action.extra !== 'first_enemy_unit_skill_each_turn') return;
          if (action.type !== 'apply_keyword') return;
          this.applyAction(opponentTurn, action, sourceCard.instanceId);
          opponent.enemyUnitSkillTriggeredThisTurn = true;
        });
      });
    });
  }

  private applyDamageToUnit(unit: BattleCardInstance | null, damage: number) {
    if (!unit || damage <= 0) return;
    const shield = unit.shields ?? 0;
    if (shield > 0) {
      unit.shields = Math.max(0, shield - 1);
      return;
    }
    unit.currentHealth = (unit.currentHealth ?? unit.definition.health ?? 0) - damage;
  }

  private getActiveCards(side: BattleSideState) {
    return [
      ...side.board.filter((card): card is BattleCardInstance => !!card),
      ...side.strategies.filter((card): card is BattleCardInstance => !!card),
    ];
  }

  private getAllUnits() {
    return [
      ...this.playerState.board.filter((card): card is BattleCardInstance => !!card),
      ...this.enemyState.board.filter((card): card is BattleCardInstance => !!card),
    ];
  }

  private expireTimedUnitStates(turn: BattleTurn) {
    this.getAllUnits().forEach((unit) => {
      if (unit.silenceExpiresOnTurnEnd === turn) {
        unit.silenced = false;
        unit.silenceExpiresOnTurnEnd = undefined;
      }
      if (unit.attackBlockedExpiresOnTurnEnd === turn) {
        unit.attackBlocked = false;
        unit.attackBlockedExpiresOnTurnEnd = undefined;
      }
      if (unit.attackModifierExpiresOnTurnEnd === turn) {
        unit.currentAttack = unit.baseAttackBeforeTemporaryModifier ?? unit.definition.attack;
        unit.baseAttackBeforeTemporaryModifier = undefined;
        unit.attackModifierExpiresOnTurnEnd = undefined;
      }
    });
  }

  private expireAfterAttackModifier(unit: BattleCardInstance | null) {
    if (!unit || !unit.attackModifierExpiresAfterAttack) {
      return;
    }
    unit.currentAttack = unit.baseAttackBeforeTemporaryModifier ?? unit.definition.attack;
    unit.baseAttackBeforeTemporaryModifier = undefined;
    unit.attackModifierExpiresAfterAttack = false;
  }

  private triggerHeatGainPassives(actor: BattleTurn, appliedHeat: number) {
    if (appliedHeat <= 0) return;
    const side = this.getSideState(actor);
    const cards = this.getActiveCards(side);
    cards.forEach((card) => {
      if (card.silenced && card.definition.type === 'unit') {
        return;
      }
      card.definition.effects.forEach((effect) => {
        if (effect.trigger !== 'passive') return;
        effect.actions.forEach((action) => {
          if (action.type !== 'deal_damage_player') return;
          if (action.extra !== 'limit:3_per_turn_on_gain_heat') return;
          const remain = Math.max(0, 3 - side.heatDamageTriggersThisTurn);
          const triggerCount = Math.min(appliedHeat, remain);
          if (triggerCount <= 0) return;
          const opponent = this.getOpponentState(actor);
          opponent.reputation = Math.max(0, opponent.reputation - (triggerCount * (action.value ?? 0)));
          side.heatDamageTriggersThisTurn += triggerCount;
        });
      });
    });
  }

  private triggerEventPlayPassives(actor: BattleTurn, isFirstEventThisTurn: boolean) {
    const allSides: BattleTurn[] = ['player', 'enemy'];
    allSides.forEach((owner) => {
      const side = this.getSideState(owner);
      const cards = this.getActiveCards(side);
      cards.forEach((card) => {
        if (card.silenced && card.definition.type === 'unit') {
          return;
        }
        card.definition.effects.forEach((effect) => {
          if (effect.trigger !== 'passive') return;
          effect.actions.forEach((action) => {
            if (card.cardId === 'neutral_008' && action.type === 'draw' && action.extra === 'both_players_first_event_each_turn' && isFirstEventThisTurn) {
              this.applyAction(actor, action);
              return;
            }
            if ((effect.conditions ?? []).some((condition) => condition.type === 'played_event_this_turn')) {
              if (owner !== actor) {
                return;
              }
              if (card.cardId === 'hotspot_002' && action.type === 'modify_attack') {
                if (!card.eventPassiveAppliedThisTurn) {
                  this.applyAction(owner, { ...action, extra: 'until_end_of_turn' }, undefined, card.instanceId);
                  card.eventPassiveAppliedThisTurn = true;
                }
                return;
              }
              if (card.cardId === 'hotspot_003' && action.type === 'modify_attack') {
                this.applyAction(owner, { ...action, extra: 'until_end_of_turn' }, undefined, card.instanceId);
                return;
              }
              if (card.cardId === 'hotspot_004' && action.type === 'gain_heat') {
                if (isFirstEventThisTurn) {
                  this.applyAction(owner, action);
                }
                return;
              }
              if (action.type === 'modify_attack' || action.type === 'gain_heat') {
                this.applyAction(owner, action);
              }
            }
          });
        });
      });
    });
  }

  attackUnit(actor: BattleTurn, attackerInstanceId: string, defenderInstanceId?: string): AttackResult {
    if (this.currentTurn !== actor) {
      return { ok: false, reason: '当前不是该角色的回合' };
    }

    const side = this.getSideState(actor);
    const opponent = this.getOpponentState(actor);
    const attacker = side.board.find((unit) => unit?.instanceId === attackerInstanceId) ?? null;
    if (!attacker) {
      return { ok: false, reason: '攻击方单位不存在' };
    }
    if (attacker.exhausted) {
      return { ok: false, reason: '该单位本回合无法行动' };
    }
    if (attacker.attackBlocked) {
      return { ok: false, reason: '该单位已被禁止攻击' };
    }

    this.executeAttackEffects(actor, attacker, defenderInstanceId);

    const attackValue = attacker.currentAttack ?? attacker.definition.attack ?? 0;
    if (attackValue <= 0) {
      return { ok: false, reason: '该单位攻击力为0' };
    }

    const defender = defenderInstanceId
      ? opponent.board.find((unit) => unit?.instanceId === defenderInstanceId) ?? null
      : null;

    if (defender) {
      const defenderAttack = defender.currentAttack ?? defender.definition.attack ?? 0;
      this.applyDamageToUnit(defender, attackValue);
      this.applyDamageToUnit(attacker, defenderAttack);
    } else {
      opponent.reputation = Math.max(0, opponent.reputation - attackValue);
    }

    side.attackedThisTurn = true;
    attacker.exhausted = true;
    this.expireAfterAttackModifier(attacker);
    this.cleanupDeadUnits();

    if (this.playerState.reputation <= 0 || this.enemyState.reputation <= 0) {
      this.phase = 'finished';
      EventBus.emit('battle:finished', this.snapshot());
    } else {
      this.phase = 'battle';
    }

    EventBus.emit('battle:unit_attacked', {
      actor,
      attacker,
      defender,
      direct: !defender,
    });
    EventBus.emit('battle:updated', this.snapshot());

    return {
      ok: true,
      attacker,
      defender,
      direct: !defender,
    };
  }

  private applyAction(actor: BattleTurn, action: EffectAction, preferredTargetId?: string, selfUnitId?: string) {
    const target = this.resolveCardTarget(actor, action.target, preferredTargetId, selfUnitId);
    const side = this.getSideState(actor);

    switch (action.type) {
      case 'gain_heat':
        if (action.extra === 'if_any_player_heat_gt_0' && this.playerState.heat <= 0 && this.enemyState.heat <= 0) {
          break;
        }
        let gainValue = action.value ?? 0;
        if (!side.firstHeatGainConsumed) {
          gainValue -= side.firstHeatGainReduction;
          side.firstHeatGainConsumed = true;
        }
        if (side.nextHeatGainReduction > 0) {
          gainValue -= side.nextHeatGainReduction;
          side.nextHeatGainReduction = 0;
        }
        const appliedHeat = Math.max(0, gainValue);
        side.heat = this.clampHeat(side.heat + appliedHeat);
        if (appliedHeat > 0) {
          side.gainedHeatThisTurn = true;
          this.triggerHeatGainPassives(actor, appliedHeat);
        }
        break;
      case 'lose_heat':
        if (action.target === 'enemy_player' && action.extra === 'next_gain_this_turn_only') {
          const opponent = this.getOpponentState(actor);
          opponent.nextHeatGainReduction += action.value ?? 0;
        } else if (action.target === 'enemy_player') {
          const opponent = this.getOpponentState(actor);
          opponent.heat = this.clampHeat(opponent.heat - (action.value ?? 0));
        } else {
          side.heat = this.clampHeat(side.heat - (action.value ?? 0));
        }
        break;
      case 'draw':
        if (action.target === 'enemy_player') {
          this.drawCards(this.getOpponentState(actor), action.value ?? 0);
        } else {
          this.drawCards(side, action.value ?? 0);
        }
        break;
      case 'discard':
        for (let i = 0; i < (action.value ?? 0); i++) {
          const discarded = side.hand.pop();
          if (!discarded) break;
          side.discard.push(discarded);
        }
        break;
      case 'deal_damage_player':
        if (action.target === 'enemy_player') {
          const opponent = this.getOpponentState(actor);
          opponent.reputation = Math.max(0, opponent.reputation - (action.value ?? 0));
        } else {
          side.reputation = Math.max(0, side.reputation - (action.value ?? 0));
        }
        break;
      case 'deal_damage_unit':
        if (Array.isArray(target)) {
          target.forEach((unit) => this.applyDamageToUnit(unit, action.value ?? 0));
          this.cleanupDeadUnits();
        } else if (target && 'instanceId' in target) {
          this.applyDamageToUnit(target, action.value ?? 0);
          this.cleanupDeadUnits();
        }
        break;
      case 'heal_player':
        if (action.extra === 'if_no_attack_this_turn' && side.attackedThisTurn) {
          break;
        }
        side.reputation += action.value ?? 0;
        break;
      case 'add_evidence':
        const evidenceTargets: BattleCardInstance[] = [];
        if (Array.isArray(target)) {
          target.forEach((unit) => {
            unit.evidence = (unit.evidence ?? 0) + (action.value ?? 0);
            evidenceTargets.push(unit);
          });
        } else if (target && 'instanceId' in target) {
          target.evidence = (target.evidence ?? 0) + (action.value ?? 0);
          evidenceTargets.push(target);
        }
        this.triggerEvidencePassives(actor, evidenceTargets);
        break;
      case 'grant_shield':
        if (target && 'instanceId' in target) {
          target.shields = (target.shields ?? 0) + (action.value ?? 1);
        }
        break;
      case 'apply_keyword':
        if (target && 'instanceId' in target) {
          if (action.keyword === 'silence') {
            target.silenced = true;
            if (action.extra === 'until_end_of_turn') {
              target.silenceExpiresOnTurnEnd = this.currentTurn;
            } else if (action.extra === 'until_next_turn_end') {
              target.silenceExpiresOnTurnEnd = this.currentTurn === 'player' ? 'enemy' : 'player';
            }
          }
          if (action.keyword === 'cannot_attack') {
            target.attackBlocked = true;
            if (action.extra === 'until_end_of_turn') {
              target.attackBlockedExpiresOnTurnEnd = this.currentTurn;
            } else if (action.extra === 'until_next_turn_end') {
              target.attackBlockedExpiresOnTurnEnd = this.currentTurn === 'player' ? 'enemy' : 'player';
            }
          }
          if (action.keyword === 'shield') {
            target.shields = (target.shields ?? 0) + 1;
          }
        }
        break;
      case 'modify_cost':
        if (action.extra === 'next_event_this_turn') {
          side.nextEventCostModifier += action.value ?? 0;
        }
        break;
      case 'modify_attack':
        if (action.extra === 'if_any_evidence_until_end_of_turn' && !this.hasAnyEvidenceOnBoard()) {
          break;
        }
        if (target && 'instanceId' in target) {
          const hasTimedModifier = action.extra === 'until_end_of_turn' || action.extra === 'until_next_turn_end' || action.extra === 'if_any_evidence_until_end_of_turn';
          const hasAttackScopedModifier = action.extra === 'until_attack_end';
          if ((hasTimedModifier && target.attackModifierExpiresOnTurnEnd === undefined) || (hasAttackScopedModifier && !target.attackModifierExpiresAfterAttack)) {
            target.baseAttackBeforeTemporaryModifier = target.currentAttack ?? target.definition.attack ?? 0;
          }
          target.currentAttack = (target.currentAttack ?? target.definition.attack ?? 0) + (action.value ?? 0);
          if (action.extra === 'until_end_of_turn' || action.extra === 'if_any_evidence_until_end_of_turn') {
            target.attackModifierExpiresOnTurnEnd = this.currentTurn;
          } else if (action.extra === 'until_next_turn_end') {
            target.attackModifierExpiresOnTurnEnd = this.currentTurn === 'player' ? 'enemy' : 'player';
          } else if (action.extra === 'until_attack_end') {
            target.attackModifierExpiresAfterAttack = true;
          }
        }
        break;
      case 'destroy_unit':
        if (target && 'instanceId' in target) {
          this.destroyUnit(actor, target);
        }
        break;
      case 'scry_draw':
        this.drawCards(side, 1);
        break;
      default:
        break;
    }
  }

  private executeTriggeredEffects(actor: BattleTurn, trigger: CardEffect['trigger']) {
    const side = this.getSideState(actor);
    const cards = [
      ...side.board.filter((card): card is BattleCardInstance => !!card),
      ...side.strategies.filter((card): card is BattleCardInstance => !!card),
    ];

    cards.forEach((card) => {
      if (card.silenced && card.definition.type === 'unit') {
        return;
      }
      card.definition.effects.forEach((effect) => {
        if (effect.trigger !== trigger) return;
        const allMatched = (effect.conditions ?? []).every((condition) => this.evaluateCondition(actor, condition, effect.actions[0]?.target));
        if (!allMatched) return;
        this.triggerEnemyUnitSkillPassives(actor, card);
        effect.actions.forEach((action) => this.applyAction(actor, action));
      });
    });

    this.cleanupDeadUnits();
    if (this.playerState.reputation <= 0 || this.enemyState.reputation <= 0) {
      this.phase = 'finished';
      EventBus.emit('battle:finished', this.snapshot());
    }
  }

  private executeEffects(actor: BattleTurn, effects: CardEffect[], preferredTargetId?: string, sourceCard?: BattleCardInstance) {
    effects.forEach((effect) => {
      if (effect.trigger !== 'on_play') return;
      const allMatched = (effect.conditions ?? []).every((condition) => this.evaluateCondition(actor, condition, effect.actions[0]?.target, preferredTargetId));
      if (!allMatched) return;
      if (sourceCard) {
        this.triggerEnemyUnitSkillPassives(actor, sourceCard);
      }
      effect.actions.forEach((action) => this.applyAction(actor, action, preferredTargetId));
    });
  }

  private executeAttackEffects(actor: BattleTurn, card: BattleCardInstance, preferredTargetId?: string) {
    if (card.silenced && card.definition.type === 'unit') {
      return;
    }
    card.definition.effects.forEach((effect) => {
      if (effect.trigger !== 'on_attack') return;
      const allMatched = (effect.conditions ?? []).every((condition) => this.evaluateCondition(actor, condition, effect.actions[0]?.target, preferredTargetId));
      if (!allMatched) return;
      this.triggerEnemyUnitSkillPassives(actor, card);
      effect.actions.forEach((action) => {
        const runtimeAction = action.target === 'self' && action.type === 'modify_attack'
          ? { ...action, extra: 'until_attack_end' }
          : action;
        this.applyAction(actor, runtimeAction, preferredTargetId, card.instanceId);
      });
    });
  }

  private triggerEvidencePassives(actor: BattleTurn, targetUnits: BattleCardInstance[]) {
    const side = this.getSideState(actor);
    const cards = [
      ...side.board.filter((card): card is BattleCardInstance => !!card),
      ...side.strategies.filter((card): card is BattleCardInstance => !!card),
    ];

    cards.forEach((card) => {
      if (card.silenced && card.definition.type === 'unit') {
        return;
      }
      card.definition.effects.forEach((effect) => {
        if (effect.trigger !== 'passive') return;
        effect.actions.forEach((action) => {
          if (action.extra === 'first_enemy_evidence_each_turn' && !side.enemyReceivedEvidenceThisTurn) {
            this.applyAction(actor, action);
          }
          if (action.extra === 'when_reaching_3_evidence') {
            const crossed = targetUnits.some((unit) => (unit.evidence ?? 0) >= 3);
            if (crossed) {
              targetUnits.filter((unit) => (unit.evidence ?? 0) >= 3).forEach((unit) => this.applyAction(actor, action, unit.instanceId));
            }
          }
        });
      });
    });

    if (targetUnits.length > 0) {
      side.enemyReceivedEvidenceThisTurn = true;
    }
  }

  playCard(actor: BattleTurn, instanceId: string, preferredTargetId?: string): PlayCardResult {
    if (this.currentTurn !== actor) {
      return { ok: false, reason: '当前不是该角色的回合' };
    }

    const side = this.getSideState(actor);
    const handCard = side.hand.find((card) => card.instanceId === instanceId);
    if (!handCard) {
      return { ok: false, reason: '手牌中不存在该卡' };
    }

    const playCost = this.getPlayCost(side, handCard);

    if (!this.spendActionPoint(side, playCost)) {
      return { ok: false, reason: '行动点不足' };
    }

    const card = this.removeHandCard(side, instanceId);
    if (!card) {
      return { ok: false, reason: '移除手牌失败' };
    }

    const isFirstEventThisTurn = card.definition.type === 'event' && !side.firstEventCostConsumed;
    if (card.definition.type === 'event') {
      side.eventPlayedThisTurn = true;
      side.firstEventCostConsumed = true;
      side.nextEventCostModifier = 0;
      this.triggerEventPlayPassives(actor, isFirstEventThisTurn);
    }

    if (card.definition.type === 'unit') {
      const slot = this.findOpenSlot(side.board);
      if (slot < 0) {
        side.hand.push(card);
        side.actionPoints += playCost;
        return { ok: false, reason: '单位区已满' };
      }
      card.exhausted = true;
      side.board[slot] = card;
      this.applyImmediateEventStatePassives(actor, card);
      if (!card.silenced) {
        this.executeEffects(actor, card.definition.effects, preferredTargetId, card);
      }
    } else if (card.definition.type === 'strategy') {
      const slot = this.findOpenSlot(side.strategies);
      if (slot < 0) {
        side.hand.push(card);
        side.actionPoints += playCost;
        return { ok: false, reason: '策略区已满' };
      }
      side.strategies[slot] = card;
      this.executeEffects(actor, card.definition.effects, preferredTargetId, card);
    } else {
      this.executeEffects(actor, card.definition.effects, preferredTargetId, card);
      side.discard.push(card);
    }

    if (this.playerState.reputation <= 0 || this.enemyState.reputation <= 0) {
      this.phase = 'finished';
      EventBus.emit('battle:finished', this.snapshot());
    } else {
      this.phase = 'main';
    }

    EventBus.emit('battle:card_played', { actor, card });
    EventBus.emit('battle:updated', this.snapshot());
    return { ok: true, card };
  }

  startBattle(maxRounds: number, playerDeckId?: string, enemyDeckId?: string) {
    this.maxRounds = maxRounds;
    if (playerDeckId) this.playerDeckId = playerDeckId;
    if (enemyDeckId) this.enemyDeckId = enemyDeckId;
    this.round = 1;
    this.phase = 'main';
    this.currentTurn = 'player';
    this._instanceSeed = 1;
    this.playerState = this.createEmptySideState();
    this.enemyState = this.createEmptySideState();
    this.playerState.deck = this.buildDeck('player');
    this.enemyState.deck = this.buildDeck('enemy');
    this.drawCards(this.playerState, BattleConfig.initialHandSize);
    this.drawCards(this.enemyState, BattleConfig.initialHandSize);
    this.playerState.actionPoints = BattleConfig.actionPointsPerTurn;
    this.enemyState.actionPoints = BattleConfig.actionPointsPerTurn;
    EventBus.emit('battle:updated', this.snapshot());
  }

  snapshot() {
    return {
      round: this.round,
      maxRounds: this.maxRounds,
      phase: this.phase,
      currentTurn: this.currentTurn,
      playerState: {
        reputation: this.playerState.reputation,
        heat: this.playerState.heat,
        actionPoints: this.playerState.actionPoints,
        deckCount: this.playerState.deck.length,
        handCount: this.playerState.hand.length,
        discardCount: this.playerState.discard.length,
        board: this.playerState.board,
        strategies: this.playerState.strategies,
      },
      enemyState: {
        reputation: this.enemyState.reputation,
        heat: this.enemyState.heat,
        actionPoints: this.enemyState.actionPoints,
        deckCount: this.enemyState.deck.length,
        handCount: this.enemyState.hand.length,
        discardCount: this.enemyState.discard.length,
        board: this.enemyState.board,
        strategies: this.enemyState.strategies,
      },
    };
  }
}
