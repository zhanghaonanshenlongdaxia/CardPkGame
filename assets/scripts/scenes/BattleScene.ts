import { _decorator, Color, Component, EventTouch, Graphics, Label, Node, tween, UITransform, Vec3, Size, director, Sprite, SpriteFrame, Texture2D, resources, ImageAsset } from 'cc';
import { Arch } from '../framework/Arch';
import { EventBus } from '../framework/EventBus';
import { GameInstaller } from '../installers/GameInstaller';
import { BattleModel } from '../models/BattleModel';
import { BattleConfig } from '../data/BattleConfig';
import { DeckPresets, DECK_MIN_SIZE, DECK_MAX_SIZE } from '../data/DeckPresets';
import { CardLibrary } from '../data/CardLibrary';

const { ccclass } = _decorator;

/*
 * 卡牌对战 BattleScene — 框架已迁移，待填充卡牌玩法内容
 * 当前保留基础对战流程：玩家出牌 → 对手出牌 → 结算
 */

const W = 1280, H = 720;

@ccclass('BattleScene')
export class BattleScene extends Component {

  /* -- nodes -- */
  private endPanel: Node | null = null;
  private playBtn: Node | null = null;
  private attackBtn: Node | null = null;
  private endTurnBtn: Node | null = null;

  /* -- labels -- */
  private roundLabel: Label | null = null;
  private scoreLabel: Label | null = null;
  private turnLabel: Label | null = null;
  private resultLabel: Label | null = null;
  private detailLabel: Label | null = null;
  private playerBoardLabel: Label | null = null;
  private enemyBoardLabel: Label | null = null;
  private playerHandLabel: Label | null = null;
  private enemyHandLabel: Label | null = null;
  private actionHintLabel: Label | null = null;
  private selectionLabel: Label | null = null;
  private logLabel: Label | null = null;
  private cardDetailPanel: Node | null = null;
  private cardDetailLabel: Label | null = null;

  /* -- state -- */
  private _battle: BattleModel | null = null;
  private _busy = false;
  private _selectedHandIndex = 0;
  private _selectedAttackerIndex = 0;
  private _selectedTargetIndex = 0;
  private _selectedPlayerDeckIndex = 0;
  private _selectedEnemyDeckIndex = 1;
  private deckSelectPanel: Node | null = null;
  private deckInfoLabel: Label | null = null;
  private _battleLog: string[] = [];
  private _cardDetailVisible = false;
  private deckBuilderPanel: Node | null = null;
  private deckBuilderListLabel: Label | null = null;
  private deckBuilderInfoLabel: Label | null = null;
  private _deckBuilderCardIndex = 0;
  private _deckBuilderForPlayer = true;

  /* -- card visuals -- */
  private playerHandContainer: Node | null = null;
  private playerBoardContainer: Node | null = null;
  private enemyBoardContainer: Node | null = null;
  private enemyHandContainer: Node | null = null;
  private _tableNode: Node | null = null;
  private _handCardNodes: Node[] = [];
  private _playerBoardNodes: Node[] = [];
  private _enemyBoardNodes: Node[] = [];
  private _enemyHandNodes: Node[] = [];

  private dly(s: number, cb: () => void) { setTimeout(cb, s * 1000); }

  private appendLog(msg: string) {
    this._battleLog.push(msg);
    if (this._battleLog.length > 6) this._battleLog.shift();
    if (this.logLabel) this.logLabel.string = this._battleLog.join('\n');
  }

  /* ================ card visuals ================ */

  private static readonly CARD_W = 90;
  private static readonly CARD_H = 120;
  private static readonly CARD_W_SM = 70;
  private static readonly CARD_H_SM = 95;

  private _sfCache: Map<string, SpriteFrame> = new Map();
  private _texturesReady = false;

  private preloadTextures(cb?: () => void) {
    const paths = [
      'textures/cards/card_hotspot',
      'textures/cards/card_moderation',
      'textures/cards/card_evidence',
      'textures/card_back/card_back',
      'textures/battlefield/battlefield_bg',
      'textures/banners/banner_your_turn',
      'textures/banners/banner_enemy_turn',
    ];
    let loaded = 0;
    const total = paths.length;
    paths.forEach((p) => {
      resources.load(p, SpriteFrame, (err, sf) => {
        if (!err && sf) {
          this._sfCache.set(p, sf);
        } else {
          // try loading as Texture2D and create SpriteFrame
          resources.load(p, Texture2D, (err2, tex) => {
            if (!err2 && tex) {
              const sf2 = new SpriteFrame();
              sf2.texture = tex;
              this._sfCache.set(p, sf2);
            }
          });
        }
        loaded++;
        if (loaded >= total) {
          this._texturesReady = true;
          if (cb) cb();
        }
      });
    });
  }

  private getSF(camp: string): SpriteFrame | null {
    const key = `textures/cards/card_${camp}`;
    return this._sfCache.get(key) ?? null;
  }

  private getBackSF(): SpriteFrame | null {
    return this._sfCache.get('textures/card_back/card_back') ?? null;
  }

  private getBattlefieldSF(): SpriteFrame | null {
    return this._sfCache.get('textures/battlefield/battlefield_bg') ?? null;
  }

  private getBannerSF(isPlayer: boolean): SpriteFrame | null {
    const key = isPlayer ? 'textures/banners/banner_your_turn' : 'textures/banners/banner_enemy_turn';
    return this._sfCache.get(key) ?? null;
  }

  private campColor(camp: string): Color {
    switch (camp) {
      case 'hotspot': return new Color(180, 60, 40);
      case 'moderation': return new Color(40, 90, 160);
      case 'evidence': return new Color(50, 140, 70);
      default: return new Color(100, 100, 110);
    }
  }

  private createCardNode(
    name: string, cost: number, atk: number | undefined, hp: number | undefined,
    camp: string, type: string, parent: Node, small = false,
    selected = false, exhausted = false,
    shields = 0, silenced = false, evidence = 0, attackBlocked = false,
  ): Node {
    const cw = small ? BattleScene.CARD_W_SM : BattleScene.CARD_W;
    const ch = small ? BattleScene.CARD_H_SM : BattleScene.CARD_H;
    const n = new Node('Card'); n.parent = parent;
    n.addComponent(UITransform).setContentSize(new Size(cw, ch));
    n.layer = this.node.layer;

    // try sprite background
    const sf = this.getSF(camp);
    if (sf) {
      const sp = n.addComponent(Sprite);
      sp.spriteFrame = sf;
      sp.sizeMode = Sprite.SizeMode.CUSTOM;
      if (exhausted) sp.color = new Color(140, 140, 140, 180);
    } else {
      // fallback: Graphics
      const g = n.addComponent(Graphics);
      const bgCol = this.campColor(camp);
      const alpha = exhausted ? 140 : 230;
      g.fillColor = new Color(bgCol.r, bgCol.g, bgCol.b, alpha);
      g.roundRect(-cw / 2, -ch / 2, cw, ch, 6); g.fill();
      g.strokeColor = new Color(200, 200, 200, 160); g.lineWidth = 1.5;
      g.roundRect(-cw / 2, -ch / 2, cw, ch, 6); g.stroke();
      // inner art area
      const artH = small ? 30 : 40;
      g.fillColor = new Color(0, 0, 0, 60);
      g.rect(-cw / 2 + 4, ch / 2 - 4 - artH - 16, cw - 8, artH); g.fill();
      // cost circle
      g.fillColor = new Color(30, 80, 180, 220);
      g.circle(-cw / 2 + 12, ch / 2 - 12, small ? 10 : 12); g.fill();
      // atk/hp circles
      if (atk !== undefined && hp !== undefined) {
        g.fillColor = new Color(200, 160, 30, 220);
        g.circle(-cw / 2 + 12, -ch / 2 + 12, small ? 10 : 12); g.fill();
        g.fillColor = new Color(200, 40, 40, 220);
        g.circle(cw / 2 - 12, -ch / 2 + 12, small ? 10 : 12); g.fill();
      }
    }

    // selected highlight border (overlay)
    if (selected) {
      const border = new Node('Sel'); border.parent = n;
      border.addComponent(UITransform).setContentSize(new Size(cw + 4, ch + 4));
      border.layer = this.node.layer;
      const bg = border.addComponent(Graphics);
      bg.strokeColor = new Color(255, 230, 60, 255); bg.lineWidth = 3;
      bg.roundRect(-(cw + 4) / 2, -(ch + 4) / 2, cw + 4, ch + 4, 8); bg.stroke();
    }

    // cost label (top-left, on the blue gem)
    const costLbl = this.mkLabel('Cost', 0, 0, small ? 10 : 13, Color.WHITE, n);
    costLbl.isBold = true; costLbl.string = `${cost}`;
    costLbl.node.setPosition(-cw / 2 + 12, ch / 2 - 12, 0);

    // name (center-top)
    const nameLbl = this.mkLabel('Name', 0, 0, small ? 9 : 11, Color.WHITE, n);
    nameLbl.string = name.length > 5 ? name.substring(0, 5) : name;
    nameLbl.node.setPosition(6, ch / 2 - 12, 0);
    nameLbl.overflow = Label.Overflow.CLAMP;
    const nameUT = nameLbl.node.getComponent(UITransform);
    if (nameUT) nameUT.setContentSize(new Size(cw - 30, 18));

    // type icon (middle of card)
    const typeChar = type === 'unit' ? '⚔' : type === 'event' ? '✦' : '◆';
    const typeLbl = this.mkLabel('Type', 0, 0, small ? 16 : 20, new Color(255, 255, 255, 180), n);
    typeLbl.string = typeChar;
    typeLbl.node.setPosition(0, small ? 8 : 12, 0);

    // attack & health labels (bottom corners, on the gems)
    if (atk !== undefined && hp !== undefined) {
      const atkLbl = this.mkLabel('Atk', 0, 0, small ? 10 : 13, Color.WHITE, n);
      atkLbl.isBold = true; atkLbl.string = `${atk}`;
      atkLbl.node.setPosition(-cw / 2 + 12, -ch / 2 + 12, 0);
      const hpLbl = this.mkLabel('Hp', 0, 0, small ? 10 : 13, Color.WHITE, n);
      hpLbl.isBold = true; hpLbl.string = `${hp}`;
      hpLbl.node.setPosition(cw / 2 - 12, -ch / 2 + 12, 0);
    }

    // status markers
    const statusParts: string[] = [];
    if (exhausted) statusParts.push('Z');
    if (shields > 0) statusParts.push(`🛡${shields}`);
    if (silenced) statusParts.push('✕');
    if (attackBlocked) statusParts.push('🚫');
    if (evidence > 0) statusParts.push(`E${evidence}`);
    if (statusParts.length > 0 && !small) {
      const statusLbl = this.mkLabel('Status', 0, 0, 9, new Color(255, 220, 100), n);
      statusLbl.string = statusParts.join(' ');
      statusLbl.node.setPosition(0, -ch / 2 + 28, 0);
      statusLbl.overflow = Label.Overflow.CLAMP;
      const sUT = statusLbl.node.getComponent(UITransform);
      if (sUT) sUT.setContentSize(new Size(cw - 8, 14));
    }

    return n;
  }

  private clearContainer(nodes: Node[]) {
    nodes.forEach((n) => { if (n.isValid) n.destroy(); });
    nodes.length = 0;
  }

  private renderCardVisuals() {
    if (!this._battle) return;
    const CW = BattleScene.CARD_W;
    const CWS = BattleScene.CARD_W_SM;
    const gap = 6;

    // --- player hand ---
    if (this.playerHandContainer) {
      this.clearContainer(this._handCardNodes);
      const hand = this._battle.playerState.hand;
      const totalW = hand.length * (CW + gap) - gap;
      const startX = -totalW / 2 + CW / 2;
      hand.forEach((card, i) => {
        const sel = i === this._selectedHandIndex;
        const cn = this.createCardNode(
          card.definition.name, card.definition.cost,
          card.definition.attack, card.definition.health,
          card.definition.camp, card.definition.type,
          this.playerHandContainer!, false, sel,
        );
        cn.setPosition(startX + i * (CW + gap), sel ? 10 : 0, 0);
        cn.on(Node.EventType.TOUCH_END, () => {
          this._selectedHandIndex = i;
          this.refreshHUD();
          this.refreshCardDetail();
        });
        this._handCardNodes.push(cn);
      });
    }

    // --- player board ---
    if (this.playerBoardContainer) {
      this.clearContainer(this._playerBoardNodes);
      const units = this._battle.playerState.board.filter(
        (u): u is NonNullable<typeof u> => !!u,
      );
      const totalW = units.length * (CW + gap) - gap;
      const startX = -totalW / 2 + CW / 2;
      units.forEach((unit, i) => {
        const sel = i === this._selectedAttackerIndex;
        const cn = this.createCardNode(
          unit.definition.name, unit.definition.cost,
          unit.currentAttack ?? unit.definition.attack ?? 0,
          unit.currentHealth ?? unit.definition.health ?? 0,
          unit.definition.camp, 'unit',
          this.playerBoardContainer!, false, sel, !!unit.exhausted,
          unit.shields ?? 0, !!unit.silenced, unit.evidence ?? 0, !!unit.attackBlocked,
        );
        cn.setPosition(startX + i * (CW + gap), 0, 0);
        cn.on(Node.EventType.TOUCH_END, () => {
          this._selectedAttackerIndex = i;
          this.showBoardCardDetail(unit);
          this.refreshHUD();
        });
        this._playerBoardNodes.push(cn);
      });
    }

    // --- enemy board ---
    if (this.enemyBoardContainer) {
      this.clearContainer(this._enemyBoardNodes);
      const units = this._battle.enemyState.board.filter(
        (u): u is NonNullable<typeof u> => !!u,
      );
      const totalW = units.length * (CW + gap) - gap;
      const startX = -totalW / 2 + CW / 2;
      units.forEach((unit, i) => {
        const sel = i === this._selectedTargetIndex;
        const cn = this.createCardNode(
          unit.definition.name, unit.definition.cost,
          unit.currentAttack ?? unit.definition.attack ?? 0,
          unit.currentHealth ?? unit.definition.health ?? 0,
          unit.definition.camp, 'unit',
          this.enemyBoardContainer!, false, sel, !!unit.exhausted,
          unit.shields ?? 0, !!unit.silenced, unit.evidence ?? 0, !!unit.attackBlocked,
        );
        cn.setPosition(startX + i * (CW + gap), 0, 0);
        cn.on(Node.EventType.TOUCH_END, () => {
          this._selectedTargetIndex = i;
          this.showBoardCardDetail(unit);
          this.refreshHUD();
        });
        this._enemyBoardNodes.push(cn);
      });
    }

    // --- enemy hand (face-down cards) ---
    if (this.enemyHandContainer) {
      this.clearContainer(this._enemyHandNodes);
      const handLen = this._battle.enemyState.hand.length;
      const totalW = handLen * (CWS + gap) - gap;
      const startX = -totalW / 2 + CWS / 2;
      const backSF = this.getBackSF();
      for (let i = 0; i < handLen; i++) {
        const cn = new Node('ECard'); cn.parent = this.enemyHandContainer;
        cn.addComponent(UITransform).setContentSize(new Size(CWS, BattleScene.CARD_H_SM));
        cn.layer = this.node.layer;
        if (backSF) {
          const sp = cn.addComponent(Sprite);
          sp.spriteFrame = backSF;
          sp.sizeMode = Sprite.SizeMode.CUSTOM;
        } else {
          const g = cn.addComponent(Graphics);
          g.fillColor = new Color(50, 55, 75, 220);
          g.roundRect(-CWS / 2, -BattleScene.CARD_H_SM / 2, CWS, BattleScene.CARD_H_SM, 5); g.fill();
          g.strokeColor = new Color(80, 90, 120, 160); g.lineWidth = 1;
          g.roundRect(-CWS / 2, -BattleScene.CARD_H_SM / 2, CWS, BattleScene.CARD_H_SM, 5); g.stroke();
          g.strokeColor = new Color(90, 100, 140, 80); g.lineWidth = 1;
          g.roundRect(-CWS / 2 + 6, -BattleScene.CARD_H_SM / 2 + 6, CWS - 12, BattleScene.CARD_H_SM - 12, 3); g.stroke();
          const qLbl = this.mkLabel('Q', 0, 0, 18, new Color(100, 110, 150, 160), cn);
          qLbl.string = '?';
        }
        cn.setPosition(startX + i * (CWS + gap), 0, 0);
        this._enemyHandNodes.push(cn);
      }
    }

    // update fallback text labels (for selection info)
    if (this.enemyHandLabel) this.enemyHandLabel.string = `敌方手牌: ${this._battle.enemyState.hand.length}张`;
    if (this.enemyBoardLabel) {
      const strats = this.summarizeStrategies('enemy');
      this.enemyBoardLabel.string = strats ? `敌方策略: ${strats}` : '';
    }
    if (this.playerBoardLabel) {
      const strats = this.summarizeStrategies('player');
      this.playerBoardLabel.string = strats ? `我方策略: ${strats}` : '';
    }
    if (this.playerHandLabel) this.playerHandLabel.string = '';
  }

  /* ================ helpers ================ */

  private gfx(nm: string, par: Node, w: number, h: number, x = 0, y = 0): Graphics {
    const n = new Node(nm); n.parent = par;
    n.addComponent(UITransform).setContentSize(new Size(w, h));
    n.setPosition(x, y, 0); n.layer = this.node.layer;
    return n.addComponent(Graphics);
  }

  private mkLabel(nm: string, x: number, y: number, sz: number, col: Color = Color.WHITE, par?: Node): Label {
    const n = new Node(nm); n.parent = par || this.node;
    n.addComponent(UITransform).setContentSize(new Size(600, sz + 20));
    n.setPosition(x, y, 0); n.layer = this.node.layer;
    const lb = n.addComponent(Label);
    lb.fontSize = sz; lb.lineHeight = sz + 6; lb.color = col;
    lb.string = ''; lb.overflow = Label.Overflow.NONE;
    lb.horizontalAlign = Label.HorizontalAlign.CENTER;
    lb.verticalAlign = Label.VerticalAlign.CENTER;
    return lb;
  }

  private mkBtn(nm: string, par: Node, x: number, y: number, w: number, h: number, txt: string, bg: Color): Node {
    const n = new Node(nm); n.parent = par;
    n.addComponent(UITransform).setContentSize(new Size(w, h));
    n.setPosition(x, y, 0); n.layer = this.node.layer;
    const g = n.addComponent(Graphics);
    g.fillColor = bg; g.roundRect(-w / 2, -h / 2, w, h, 12); g.fill();
    g.strokeColor = new Color(Math.min(255, bg.r + 50), Math.min(255, bg.g + 50), Math.min(255, bg.b + 50));
    g.lineWidth = 2; g.roundRect(-w / 2, -h / 2, w, h, 12); g.stroke();
    const lb = this.mkLabel(nm + 'L', 0, 0, 24, Color.WHITE, n);
    lb.isBold = true; lb.string = txt;
    return n;
  }

  private summarizeBoard(owner: 'player' | 'enemy') {
    const battle = this._battle;
    if (!battle) return owner === 'player' ? '我方场上: -' : '敌方场上: -';
    const side = owner === 'player' ? battle.playerState : battle.enemyState;
    const prefix = owner === 'player' ? '我方场上' : '敌方场上';
    const units = side.board
      .filter((unit): unit is NonNullable<typeof unit> => !!unit)
      .map((unit) => {
        const atk = unit.currentAttack ?? unit.definition.attack ?? 0;
        const hp = unit.currentHealth ?? unit.definition.health ?? 0;
        let tags = '';
        if (unit.evidence && unit.evidence > 0) tags += `E${unit.evidence}`;
        if (unit.shields && unit.shields > 0) tags += `S${unit.shields}`;
        if (unit.silenced) tags += 'X';
        if (unit.attackBlocked) tags += 'B';
        if (unit.exhausted) tags += 'Z';
        const suffix = tags ? `[${tags}]` : '';
        return `${unit.definition.name}(${atk}/${hp})${suffix}`;
      });
    return units.length > 0 ? `${prefix}: ${units.join('  ')}` : `${prefix}: -`;
  }

  private summarizeStrategies(owner: 'player' | 'enemy') {
    const battle = this._battle;
    if (!battle) return '';
    const side = owner === 'player' ? battle.playerState : battle.enemyState;
    const prefix = owner === 'player' ? '我方策略' : '敌方策略';
    const strats = side.strategies
      .filter((s): s is NonNullable<typeof s> => !!s)
      .map((s) => s.definition.name);
    return strats.length > 0 ? `${prefix}: ${strats.join('  ')}` : '';
  }

  private summarizeHand(owner: 'player' | 'enemy') {
    const battle = this._battle;
    if (!battle) return owner === 'player' ? '我方手牌: -' : '敌方手牌: -';
    const side = owner === 'player' ? battle.playerState : battle.enemyState;
    const prefix = owner === 'player' ? '我方手牌' : '敌方手牌';
    const cards = side.hand.slice(0, 5).map((card, index) => `${index + 1}.${card.definition.name}[${card.definition.cost}]`);
    return cards.length > 0 ? `${prefix}: ${cards.join('  ')}` : `${prefix}: -`;
  }

  private summarizeNextAction(owner: 'player' | 'enemy') {
    const battle = this._battle;
    if (!battle) return owner === 'player' ? '可操作卡牌: -' : '敌方下一步: -';
    const side = owner === 'player' ? battle.playerState : battle.enemyState;
    const prefix = owner === 'player' ? '当前可打' : '敌方下个可打';
    const nextCard = side.hand.find((card) => card.definition.cost <= side.actionPoints);
    if (!nextCard) {
      return `${prefix}: 无`;
    }
    return `${prefix}: ${nextCard.definition.name} 费用${nextCard.definition.cost}`;
  }

  private cycleIndex(current: number, total: number, step: number) {
    if (total <= 0) return 0;
    return (current + step + total) % total;
  }

  private getSelectedHandCard() {
    const hand = this._battle?.playerState.hand ?? [];
    if (hand.length === 0) return null;
    this._selectedHandIndex = Math.min(this._selectedHandIndex, hand.length - 1);
    return hand[this._selectedHandIndex] ?? null;
  }

  private getSelectedAttacker() {
    const board = (this._battle?.playerState.board ?? []).filter((unit) => !!unit);
    if (board.length === 0) return null;
    this._selectedAttackerIndex = Math.min(this._selectedAttackerIndex, board.length - 1);
    return board[this._selectedAttackerIndex] ?? null;
  }

  private getSelectedTarget() {
    const board = (this._battle?.enemyState.board ?? []).filter((unit) => !!unit);
    if (board.length === 0) return null;
    this._selectedTargetIndex = Math.min(this._selectedTargetIndex, board.length - 1);
    return board[this._selectedTargetIndex] ?? null;
  }

  private pickBestTarget(board: Array<import('../models/BattleModel').BattleCardInstance | null>, prefer: 'lowest_hp' | 'highest_atk') {
    const units = board.filter((u): u is import('../models/BattleModel').BattleCardInstance => !!u);
    if (units.length === 0) return undefined;
    if (prefer === 'lowest_hp') {
      return units.reduce((best, u) => ((u.currentHealth ?? u.definition.health ?? 0) < (best.currentHealth ?? best.definition.health ?? 0) ? u : best));
    }
    return units.reduce((best, u) => ((u.currentAttack ?? u.definition.attack ?? 0) > (best.currentAttack ?? best.definition.attack ?? 0) ? u : best));
  }

  private autoPlayAllCards(actor: 'player' | 'enemy') {
    const battle = this._battle;
    if (!battle) return;
    const state = actor === 'player' ? battle.playerState : battle.enemyState;
    const opponentBoard = (actor === 'player' ? battle.enemyState : battle.playerState).board;
    for (let i = 0; i < 10; i++) {
      const playable = state.hand.find((card) => card.definition.cost <= state.actionPoints);
      if (!playable) break;
      const target = this.pickBestTarget(opponentBoard, 'highest_atk');
      battle.playCard(actor, playable.instanceId, target?.instanceId);
      if (battle.phase === 'finished') return;
    }
  }

  private autoAttackAllUnits(actor: 'player' | 'enemy') {
    const battle = this._battle;
    if (!battle) return;
    const state = actor === 'player' ? battle.playerState : battle.enemyState;
    const enemyState = actor === 'player' ? battle.enemyState : battle.playerState;
    for (let i = 0; i < 10; i++) {
      const attacker = state.board.find((unit) => unit && !unit.exhausted && !unit.attackBlocked);
      if (!attacker) break;
      const defender = this.pickBestTarget(enemyState.board, 'lowest_hp');
      battle.attackUnit(actor, attacker.instanceId, defender?.instanceId);
      if (battle.phase === 'finished') return;
    }
  }

  /* ================ deck select ================ */

  private refreshDeckInfo() {
    if (!this.deckInfoLabel) return;
    const pDeck = DeckPresets[this._selectedPlayerDeckIndex];
    const eDeck = DeckPresets[this._selectedEnemyDeckIndex];
    this.deckInfoLabel.string =
      `你的牌组: ${pDeck.name} (${pDeck.cards.length}张) — ${pDeck.description}\n` +
      `对手牌组: ${eDeck.name} (${eDeck.cards.length}张) — ${eDeck.description}`;
  }

  private buildDeckSelectPanel() {
    const panel = new Node('DeckSelect'); panel.parent = this.node;
    panel.addComponent(UITransform).setContentSize(new Size(620, 300));
    panel.setPosition(0, 30, 0); panel.layer = this.node.layer;
    panel.active = false;
    const g = panel.addComponent(Graphics);
    g.fillColor = new Color(12, 22, 45, 245);
    g.roundRect(-310, -150, 620, 300, 16); g.fill();
    g.strokeColor = new Color(80, 130, 200, 160); g.lineWidth = 2;
    g.roundRect(-310, -150, 620, 300, 16); g.stroke();
    this.mkLabel('DSTitle', 0, 120, 24, new Color(255, 255, 200), panel).string = '选择牌组';
    this.deckInfoLabel = this.mkLabel('DSInfo', 0, 40, 14, new Color(210, 220, 240), panel);
    this.deckInfoLabel.overflow = Label.Overflow.CLAMP;
    const diUT = this.deckInfoLabel.node.getComponent(UITransform);
    if (diUT) diUT.setContentSize(new Size(580, 80));
    const prevP = this.mkBtn('PrevP', panel, -200, -30, 120, 38, '← 你的牌组', new Color(60, 100, 160));
    const nextP = this.mkBtn('NextP', panel, -60, -30, 120, 38, '你的牌组 →', new Color(60, 100, 160));
    const prevE = this.mkBtn('PrevE', panel, 60, -30, 120, 38, '← 对手牌组', new Color(140, 80, 80));
    const nextE = this.mkBtn('NextE', panel, 200, -30, 120, 38, '对手牌组 →', new Color(140, 80, 80));
    const startBtn = this.mkBtn('StartBtn', panel, -60, -100, 200, 50, '开始对战', new Color(50, 150, 70));
    const editDeckBtn = this.mkBtn('EditDeck', panel, 150, -100, 130, 40, '编辑自定义', new Color(120, 90, 50));
    prevP.on(Node.EventType.TOUCH_END, () => { this._selectedPlayerDeckIndex = (this._selectedPlayerDeckIndex - 1 + DeckPresets.length) % DeckPresets.length; this.refreshDeckInfo(); });
    nextP.on(Node.EventType.TOUCH_END, () => { this._selectedPlayerDeckIndex = (this._selectedPlayerDeckIndex + 1) % DeckPresets.length; this.refreshDeckInfo(); });
    prevE.on(Node.EventType.TOUCH_END, () => { this._selectedEnemyDeckIndex = (this._selectedEnemyDeckIndex - 1 + DeckPresets.length) % DeckPresets.length; this.refreshDeckInfo(); });
    nextE.on(Node.EventType.TOUCH_END, () => { this._selectedEnemyDeckIndex = (this._selectedEnemyDeckIndex + 1) % DeckPresets.length; this.refreshDeckInfo(); });
    editDeckBtn.on(Node.EventType.TOUCH_END, () => { this.openDeckBuilder(true); });
    startBtn.on(Node.EventType.TOUCH_END, () => {
      const pDeck = DeckPresets[this._selectedPlayerDeckIndex];
      const eDeck = DeckPresets[this._selectedEnemyDeckIndex];
      if (pDeck.id === 'custom' && pDeck.cards.length < DECK_MIN_SIZE) {
        if (this.deckInfoLabel) this.deckInfoLabel.string = `你的自定义牌组至少需要${DECK_MIN_SIZE}张! 请先编辑牌组。`;
        return;
      }
      if (eDeck.id === 'custom' && eDeck.cards.length < DECK_MIN_SIZE) {
        if (this.deckInfoLabel) this.deckInfoLabel.string = `对手的自定义牌组至少需要${DECK_MIN_SIZE}张! 请先编辑牌组。`;
        return;
      }
      panel.active = false;
      this._battleLog = [];
      if (this.logLabel) this.logLabel.string = '';
      this._battle?.startBattle(BattleConfig.maxRounds, pDeck.id, eDeck.id);
      this.appendLog(`对局开始: ${pDeck.name} vs ${eDeck.name}`);
      this.refreshHUD();
    });
    this.deckSelectPanel = panel;
    this.refreshDeckInfo();
  }

  /* ================ card detail ================ */

  private buildCardDetailPanel() {
    const panel = new Node('CardDetail'); panel.parent = this.node;
    panel.addComponent(UITransform).setContentSize(new Size(260, 280));
    panel.setPosition(-520, 80, 0); panel.layer = this.node.layer;
    panel.active = false;
    const g = panel.addComponent(Graphics);
    g.fillColor = new Color(15, 22, 42, 240);
    g.roundRect(-120, -130, 240, 260, 10); g.fill();
    g.strokeColor = new Color(100, 140, 200, 150); g.lineWidth = 1.5;
    g.roundRect(-120, -130, 240, 260, 10); g.stroke();
    this.mkLabel('CDTitle', -520, 140, 15, new Color(255, 230, 160), this.node).string = '';
    this.cardDetailLabel = this.mkLabel('CDBody', -520, 40, 12, new Color(200, 210, 225));
    this.cardDetailLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
    this.cardDetailLabel.verticalAlign = Label.VerticalAlign.TOP;
    this.cardDetailLabel.overflow = Label.Overflow.CLAMP;
    const cdUT = this.cardDetailLabel.node.getComponent(UITransform);
    if (cdUT) cdUT.setContentSize(new Size(220, 220));
    this.cardDetailPanel = panel;
    const toggleBtn = this.mkBtn('ToggleDetail', this.node, -520, -65, 110, 32, '卡牌详情', new Color(70, 80, 110));
    toggleBtn.on(Node.EventType.TOUCH_END, () => {
      this._cardDetailVisible = !this._cardDetailVisible;
      if (this.cardDetailPanel) this.cardDetailPanel.active = this._cardDetailVisible;
      if (this._cardDetailVisible) this.refreshCardDetail();
    });
  }

  private refreshCardDetail() {
    if (!this.cardDetailLabel || !this._cardDetailVisible) return;
    const card = this.getSelectedHandCard();
    if (!card) {
      this.cardDetailLabel.string = '没有选中手牌';
      return;
    }
    const d = card.definition;
    const typeMap: Record<string, string> = { unit: '单位', event: '事件', strategy: '策略' };
    const campMap: Record<string, string> = { hotspot: '热搜流', moderation: '管控流', evidence: '实锤流', neutral: '中立' };
    const rarityMap: Record<string, string> = { common: '普通', rare: '稀有', epic: '史诗', legendary: '传说' };
    let info = `【${d.name}】\n`;
    info += `类型: ${typeMap[d.type] ?? d.type}  阵营: ${campMap[d.camp] ?? d.camp}\n`;
    info += `稀有度: ${rarityMap[d.rarity] ?? d.rarity}  费用: ${d.cost}\n`;
    if (d.attack !== undefined || d.health !== undefined) {
      info += `攻击: ${d.attack ?? '-'}  生命: ${d.health ?? '-'}\n`;
    }
    info += `\n${d.text}\n`;
    if (d.effects.length > 0) {
      info += '\n效果:\n';
      d.effects.forEach((e) => { info += `· ${e.description}\n`; });
    }
    this.cardDetailLabel.string = info;
  }

  private showBoardCardDetail(unit: { definition: { name: string; cost: number; attack?: number; health?: number; camp: string; type: string; text: string; rarity: string; effects: { description: string }[] }; currentAttack?: number; currentHealth?: number; exhausted?: boolean; shields?: number; silenced?: boolean; evidence?: number; attackBlocked?: boolean }) {
    if (!this.cardDetailLabel) return;
    this._cardDetailVisible = true;
    if (this.cardDetailPanel) this.cardDetailPanel.active = true;
    const d = unit.definition;
    const typeMap: Record<string, string> = { unit: '单位', event: '事件', strategy: '策略' };
    const campMap: Record<string, string> = { hotspot: '热搜流', moderation: '管控流', evidence: '实锤流', neutral: '中立' };
    const atk = unit.currentAttack ?? d.attack ?? 0;
    const hp = unit.currentHealth ?? d.health ?? 0;
    let info = `【${d.name}】(场上)\n`;
    info += `类型: ${typeMap[d.type] ?? d.type}  阵营: ${campMap[d.camp] ?? d.camp}\n`;
    info += `费用: ${d.cost}  攻击: ${atk}  生命: ${hp}\n`;
    const statuses: string[] = [];
    if (unit.exhausted) statuses.push('已疲劳');
    if (unit.shields && unit.shields > 0) statuses.push(`护盾x${unit.shields}`);
    if (unit.silenced) statuses.push('已沉默');
    if (unit.attackBlocked) statuses.push('攻击封锁');
    if (unit.evidence && unit.evidence > 0) statuses.push(`证据x${unit.evidence}`);
    if (statuses.length > 0) info += `状态: ${statuses.join(' ')}\n`;
    info += `\n${d.text}\n`;
    if (d.effects.length > 0) {
      info += '\n效果:\n';
      d.effects.forEach((e) => { info += `· ${e.description}\n`; });
    }
    this.cardDetailLabel.string = info;
  }

  private showTurnBanner(text: string, color: Color, isPlayerTurn = true) {
    const banner = new Node('TurnBanner'); banner.parent = this.node;
    banner.addComponent(UITransform).setContentSize(new Size(400, 80));
    banner.layer = this.node.layer;
    banner.setPosition(0, 80, 0);
    const bannerSF = this.getBannerSF(isPlayerTurn);
    if (bannerSF) {
      const sp = banner.addComponent(Sprite);
      sp.spriteFrame = bannerSF;
      sp.sizeMode = Sprite.SizeMode.CUSTOM;
    } else {
      const g = banner.addComponent(Graphics);
      g.fillColor = new Color(0, 0, 0, 180);
      g.roundRect(-200, -40, 400, 80, 12); g.fill();
      g.strokeColor = color; g.lineWidth = 2;
      g.roundRect(-200, -40, 400, 80, 12); g.stroke();
      const lbl = this.mkLabel('BLbl', 0, 0, 22, color, banner);
      lbl.isBold = true; lbl.string = text;
    }
    banner.setScale(new Vec3(0, 1, 1));
    tween(banner)
      .to(0.2, { scale: new Vec3(1.05, 1.05, 1) }, { easing: 'backOut' })
      .to(0.1, { scale: new Vec3(1, 1, 1) })
      .delay(0.8)
      .to(0.2, { scale: new Vec3(0, 0, 1) })
      .call(() => { if (banner.isValid) banner.destroy(); })
      .start();
  }

  /* ================ deck builder ================ */

  private buildDeckBuilderPanel() {
    const panel = new Node('DeckBuilder'); panel.parent = this.node;
    panel.addComponent(UITransform).setContentSize(new Size(W - 40, H - 40));
    panel.setPosition(0, 0, 0); panel.layer = this.node.layer;
    panel.active = false;
    const g = panel.addComponent(Graphics);
    g.fillColor = new Color(12, 20, 40, 250);
    g.roundRect(-(W - 40) / 2, -(H - 40) / 2, W - 40, H - 40, 16); g.fill();
    g.strokeColor = new Color(80, 130, 200, 160); g.lineWidth = 2;
    g.roundRect(-(W - 40) / 2, -(H - 40) / 2, W - 40, H - 40, 16); g.stroke();

    this.mkLabel('DBTitle', 0, 310, 22, new Color(255, 230, 160), panel).string = '自定义组牌';
    this.deckBuilderInfoLabel = this.mkLabel('DBInfo', 0, 275, 14, new Color(180, 200, 220), panel);
    this.deckBuilderListLabel = this.mkLabel('DBList', -200, 50, 13, new Color(210, 220, 235), panel);
    this.deckBuilderListLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
    this.deckBuilderListLabel.verticalAlign = Label.VerticalAlign.TOP;
    this.deckBuilderListLabel.overflow = Label.Overflow.CLAMP;
    const listUT = this.deckBuilderListLabel.node.getComponent(UITransform);
    if (listUT) listUT.setContentSize(new Size(380, 460));

    const deckContentLabel = this.mkLabel('DBDeck', 250, 50, 12, new Color(190, 210, 230), panel);
    deckContentLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
    deckContentLabel.verticalAlign = Label.VerticalAlign.TOP;
    deckContentLabel.overflow = Label.Overflow.CLAMP;
    const deckUT = deckContentLabel.node.getComponent(UITransform);
    if (deckUT) deckUT.setContentSize(new Size(280, 460));
    this.mkLabel('DBDeckTitle', 250, 275, 14, new Color(255, 200, 120), panel).string = '当前牌组内容';

    const prevBtn = this.mkBtn('DBPrev', panel, -280, -295, 90, 38, '上一张', new Color(60, 80, 120));
    const nextBtn = this.mkBtn('DBNext', panel, -170, -295, 90, 38, '下一张', new Color(60, 80, 120));
    const addBtn = this.mkBtn('DBAdd', panel, -50, -295, 90, 38, '加入', new Color(50, 130, 70));
    const removeBtn = this.mkBtn('DBRemove', panel, 60, -295, 90, 38, '移除', new Color(150, 60, 60));
    const doneBtn = this.mkBtn('DBDone', panel, 220, -295, 120, 44, '完成组牌', new Color(50, 120, 180));

    const allCards = CardLibrary.cards;
    const getCustomDeck = () => DeckPresets.find((d) => d.id === 'custom')!;

    const refreshView = () => {
      const idx = this._deckBuilderCardIndex;
      const c = allCards[idx];
      if (!c) return;
      const typeMap: Record<string, string> = { unit: '单位', event: '事件', strategy: '策略' };
      const campMap: Record<string, string> = { hotspot: '热搜流', moderation: '管控流', evidence: '实锤流', neutral: '中立' };
      const customDeck = getCustomDeck();
      const countInDeck = customDeck.cards.filter((id) => id === c.id).length;
      let cardInfo = `[${idx + 1}/${allCards.length}]  ${c.name}  (${campMap[c.camp] ?? c.camp})\n`;
      cardInfo += `类型: ${typeMap[c.type] ?? c.type}  费用: ${c.cost}`;
      if (c.attack !== undefined) cardInfo += `  攻: ${c.attack}`;
      if (c.health !== undefined) cardInfo += `  血: ${c.health}`;
      cardInfo += `\n上限: ${c.deckLimit}张  已加入: ${countInDeck}张\n\n`;
      cardInfo += `${c.text}\n`;
      if (c.effects.length > 0) {
        cardInfo += '\n效果:\n';
        c.effects.forEach((e) => { cardInfo += `· ${e.description}\n`; });
      }
      if (this.deckBuilderListLabel) this.deckBuilderListLabel.string = cardInfo;

      if (this.deckBuilderInfoLabel) {
        this.deckBuilderInfoLabel.string = `牌组张数: ${customDeck.cards.length}  (最少${DECK_MIN_SIZE}张, 最多${DECK_MAX_SIZE}张)`;
      }

      const cardCount = new Map<string, number>();
      customDeck.cards.forEach((id) => cardCount.set(id, (cardCount.get(id) ?? 0) + 1));
      let deckStr = '';
      cardCount.forEach((cnt, id) => {
        const def = allCards.find((cd) => cd.id === id);
        deckStr += `${def?.name ?? id} x${cnt}\n`;
      });
      deckContentLabel.string = deckStr || '(空)';
    };

    prevBtn.on(Node.EventType.TOUCH_END, () => {
      this._deckBuilderCardIndex = (this._deckBuilderCardIndex - 1 + allCards.length) % allCards.length;
      refreshView();
    });
    nextBtn.on(Node.EventType.TOUCH_END, () => {
      this._deckBuilderCardIndex = (this._deckBuilderCardIndex + 1) % allCards.length;
      refreshView();
    });
    addBtn.on(Node.EventType.TOUCH_END, () => {
      const c = allCards[this._deckBuilderCardIndex];
      if (!c) return;
      const customDeck = getCustomDeck();
      const countInDeck = customDeck.cards.filter((id) => id === c.id).length;
      if (countInDeck >= c.deckLimit) return;
      if (customDeck.cards.length >= DECK_MAX_SIZE) return;
      customDeck.cards.push(c.id);
      refreshView();
    });
    removeBtn.on(Node.EventType.TOUCH_END, () => {
      const c = allCards[this._deckBuilderCardIndex];
      if (!c) return;
      const customDeck = getCustomDeck();
      const idx = customDeck.cards.lastIndexOf(c.id);
      if (idx >= 0) customDeck.cards.splice(idx, 1);
      refreshView();
    });
    doneBtn.on(Node.EventType.TOUCH_END, () => {
      const customDeck = getCustomDeck();
      if (customDeck.cards.length < DECK_MIN_SIZE) {
        if (this.deckBuilderInfoLabel) this.deckBuilderInfoLabel.string = `牌组至少需要${DECK_MIN_SIZE}张! 当前: ${customDeck.cards.length}张`;
        return;
      }
      panel.active = false;
      if (this.deckSelectPanel) this.deckSelectPanel.active = true;
      this.refreshDeckInfo();
    });

    this.deckBuilderPanel = panel;
    refreshView();
  }

  private openDeckBuilder(forPlayer: boolean) {
    this._deckBuilderForPlayer = forPlayer;
    this._deckBuilderCardIndex = 0;
    if (this.deckSelectPanel) this.deckSelectPanel.active = false;
    if (this.deckBuilderPanel) {
      this.deckBuilderPanel.active = true;
      const allCards = CardLibrary.cards;
      const getCustomDeck = () => DeckPresets.find((d) => d.id === 'custom')!;
      const customDeck = getCustomDeck();
      if (this.deckBuilderInfoLabel) {
        this.deckBuilderInfoLabel.string = `牌组张数: ${customDeck.cards.length}  (最少${DECK_MIN_SIZE}张, 最多${DECK_MAX_SIZE}张)`;
      }
    }
  }

  /* ================ build scene ================ */

  private buildScene() {
    // ==== background ====
    const bg = this.gfx('Bg', this.node, W, H);
    bg.fillColor = new Color(22, 36, 68);
    bg.rect(-W / 2, -H / 2, W, H); bg.fill();

    // ==== table ====
    const tableNode = new Node('Table'); tableNode.parent = this.node;
    tableNode.addComponent(UITransform).setContentSize(new Size(900, 440));
    tableNode.setPosition(0, 50, 0); tableNode.layer = this.node.layer;
    // will be replaced with sprite when texture loads; draw fallback Graphics
    const tg = tableNode.addComponent(Graphics);
    tg.fillColor = new Color(40, 70, 45);
    tg.roundRect(-450, -220, 900, 440, 24); tg.fill();
    tg.strokeColor = new Color(85, 62, 42); tg.lineWidth = 8;
    tg.roundRect(-450, -220, 900, 440, 24); tg.stroke();
    tg.strokeColor = new Color(55, 90, 58, 100); tg.lineWidth = 1.5;
    tg.roundRect(-435, -205, 870, 410, 18); tg.stroke();
    this._tableNode = tableNode;

    // ==== top HUD ====
    const topG = this.gfx('Top', this.node, W, 56, 0, H / 2 - 28);
    topG.fillColor = new Color(10, 20, 45, 230);
    topG.rect(-W / 2, -28, W, 56); topG.fill();
    this.roundLabel = this.mkLabel('Rnd', -300, H / 2 - 28, 20, new Color(180, 200, 220));
    this.scoreLabel = this.mkLabel('Scr', 0, H / 2 - 28, 34, Color.WHITE);
    this.turnLabel  = this.mkLabel('Trn', 300, H / 2 - 28, 18, new Color(180, 255, 180));
    // card containers
    this.enemyHandContainer = new Node('EnemyHandC'); this.enemyHandContainer.parent = this.node;
    this.enemyHandContainer.addComponent(UITransform).setContentSize(new Size(800, 100));
    this.enemyHandContainer.setPosition(0, 270, 0); this.enemyHandContainer.layer = this.node.layer;

    this.enemyBoardContainer = new Node('EnemyBoardC'); this.enemyBoardContainer.parent = this.node;
    this.enemyBoardContainer.addComponent(UITransform).setContentSize(new Size(800, 130));
    this.enemyBoardContainer.setPosition(0, 150, 0); this.enemyBoardContainer.layer = this.node.layer;

    this.playerBoardContainer = new Node('PlayerBoardC'); this.playerBoardContainer.parent = this.node;
    this.playerBoardContainer.addComponent(UITransform).setContentSize(new Size(800, 130));
    this.playerBoardContainer.setPosition(0, 10, 0); this.playerBoardContainer.layer = this.node.layer;

    this.playerHandContainer = new Node('PlayerHandC'); this.playerHandContainer.parent = this.node;
    this.playerHandContainer.addComponent(UITransform).setContentSize(new Size(800, 130));
    this.playerHandContainer.setPosition(0, -140, 0); this.playerHandContainer.layer = this.node.layer;

    // zone labels
    this.mkLabel('ZEH', -400, 270, 11, new Color(140, 150, 180)).string = '敌方手牌';
    this.mkLabel('ZEB', -400, 150, 11, new Color(255, 170, 170)).string = '敌方场上';
    // divider line between enemy board and player board
    const divG = this.gfx('Divider', this.node, 800, 4, 0, 80);
    divG.fillColor = new Color(120, 140, 180, 80);
    divG.rect(-400, -2, 800, 4); divG.fill();
    this.mkLabel('ZPB', -400, 10, 11, new Color(170, 255, 170)).string = '我方场上';
    this.mkLabel('ZPH', -400, -140, 11, new Color(255, 220, 150)).string = '我方手牌';

    // fallback labels (for strategy info)
    this.enemyHandLabel = this.mkLabel('EnemyHand', 0, 320, 12, new Color(215, 225, 255));
    this.enemyBoardLabel = this.mkLabel('EnemyBoard', 0, 95, 12, new Color(255, 210, 210));
    this.playerBoardLabel = this.mkLabel('PlayerBoard', 0, -50, 12, new Color(210, 255, 210));
    this.playerHandLabel = this.mkLabel('PlayerHand', 0, -200, 12, new Color(255, 235, 180));

    // ==== battle log ====
    const logBg = this.gfx('LogBg', this.node, 220, 180, 520, 80);
    logBg.fillColor = new Color(10, 18, 38, 200);
    logBg.roundRect(-110, -90, 220, 180, 8); logBg.fill();
    logBg.strokeColor = new Color(60, 80, 120, 120); logBg.lineWidth = 1;
    logBg.roundRect(-110, -90, 220, 180, 8); logBg.stroke();
    this.mkLabel('LogTitle', 520, 160, 14, new Color(160, 180, 220)).string = '战斗日志';
    this.logLabel = this.mkLabel('LogContent', 520, 65, 12, new Color(180, 195, 210));
    this.logLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
    this.logLabel.overflow = Label.Overflow.CLAMP;
    const logUT = this.logLabel.node.getComponent(UITransform);
    if (logUT) logUT.setContentSize(new Size(200, 160));

    // ==== card detail panel ====
    this.buildCardDetailPanel();

    // ==== deck builder panel ====
    this.buildDeckBuilderPanel();

    // ==== bottom bar ====
    const botG = this.gfx('Bot', this.node, W, 40, 0, -H / 2 + 20);
    botG.fillColor = new Color(10, 20, 45, 230);
    botG.rect(-W / 2, -20, W, 40); botG.fill();
    this.detailLabel = this.mkLabel('Det', 0, -H / 2 + 20, 14, new Color(160, 170, 180));

    const controlPanel = this.gfx('ControlPanel', this.node, 700, 120, 0, -270);
    controlPanel.fillColor = new Color(12, 22, 44, 220);
    controlPanel.roundRect(-350, -60, 700, 120, 16);
    controlPanel.fill();
    controlPanel.strokeColor = new Color(90, 130, 180, 180);
    controlPanel.lineWidth = 2;
    controlPanel.roundRect(-350, -60, 700, 120, 16);
    controlPanel.stroke();
    this.actionHintLabel = this.mkLabel('ActionHint', 0, -335, 14, new Color(220, 230, 255));
    this.selectionLabel = this.mkLabel('SelectionHint', 0, -354, 13, new Color(255, 225, 180));

    // ==== placeholder: center text ====
    this.resultLabel = this.mkLabel('Res', 0, 10, 28, new Color(255, 255, 100));
    this.resultLabel.string = '使用下方按钮操作回合';

    // -- row 1: hand controls --
    const prevHandBtn = this.mkBtn('PrevHandBtn', this.node, -280, -235, 90, 40, '上一张', new Color(70, 90, 130));
    const nextHandBtn = this.mkBtn('NextHandBtn', this.node, -180, -235, 90, 40, '下一张', new Color(70, 90, 130));
    this.playBtn = this.mkBtn('PlayBtn', this.node, -50, -235, 150, 44, '出牌', new Color(46, 125, 220));
    this.endTurnBtn = this.mkBtn('EndTurnBtn', this.node, 250, -235, 150, 44, '结束回合', new Color(90, 110, 130));
    // -- row 2: battle controls --
    const nextAttackerBtn = this.mkBtn('NextAttackerBtn', this.node, -220, -290, 110, 38, '切攻击者', new Color(100, 80, 135));
    this.attackBtn = this.mkBtn('AttackBtn', this.node, -60, -290, 150, 44, '单位攻击', new Color(195, 92, 55));
    const nextTargetBtn = this.mkBtn('NextTargetBtn', this.node, 100, -290, 110, 38, '切目标', new Color(100, 80, 135));
    prevHandBtn.on(Node.EventType.TOUCH_END, () => {
      const total = this._battle?.playerState.hand.length ?? 0;
      this._selectedHandIndex = this.cycleIndex(this._selectedHandIndex, total, -1);
      this.refreshHUD();
      this.refreshCardDetail();
    });
    nextHandBtn.on(Node.EventType.TOUCH_END, () => {
      const total = this._battle?.playerState.hand.length ?? 0;
      this._selectedHandIndex = this.cycleIndex(this._selectedHandIndex, total, 1);
      this.refreshHUD();
      this.refreshCardDetail();
    });
    this.playBtn.on(Node.EventType.TOUCH_END, this.onPlayCardTap, this);
    this.attackBtn.on(Node.EventType.TOUCH_END, this.onAttackTap, this);
    this.endTurnBtn.on(Node.EventType.TOUCH_END, this.onEndTurnTap, this);
    nextAttackerBtn.on(Node.EventType.TOUCH_END, () => {
      const total = this._battle?.playerState.board.filter(Boolean).length ?? 0;
      this._selectedAttackerIndex = this.cycleIndex(this._selectedAttackerIndex, total, 1);
      this.refreshHUD();
    });
    nextTargetBtn.on(Node.EventType.TOUCH_END, () => {
      const total = this._battle?.enemyState.board.filter(Boolean).length ?? 0;
      this._selectedTargetIndex = this.cycleIndex(this._selectedTargetIndex, total, 1);
      this.refreshHUD();
    });

    // ==== deck select panel ====
    this.buildDeckSelectPanel();

    // ==== end panel ====
    this.endPanel = new Node('End'); this.endPanel.parent = this.node;
    this.endPanel.addComponent(UITransform).setContentSize(new Size(440, 180));
    this.endPanel.setPosition(0, 0, 0); this.endPanel.layer = this.node.layer;
    this.endPanel.active = false;
    const epG = this.endPanel.addComponent(Graphics);
    epG.fillColor = new Color(12, 22, 45, 240);
    epG.roundRect(-220, -90, 440, 180, 16); epG.fill();
    epG.strokeColor = new Color(80, 130, 200, 140); epG.lineWidth = 2;
    epG.roundRect(-220, -90, 440, 180, 16); epG.stroke();
    this.mkLabel('ET', 0, 50, 24, new Color(255, 255, 200), this.endPanel).string = '对局结束';
    const bR = this.mkBtn('BR', this.endPanel, -110, -25, 180, 50, '再来一局', new Color(50, 150, 70));
    bR.on(Node.EventType.TOUCH_END, this.onRestart, this);
    const bB = this.mkBtn('BB', this.endPanel, 110, -25, 180, 50, '返回主页', new Color(90, 90, 100));
    bB.on(Node.EventType.TOUCH_END, this.onBackToMain, this);
  }

  /* ================ lifecycle ================ */

  onLoad() {
    GameInstaller.install();
    this._battle = Arch.get<BattleModel>('BattleModel');
    this.buildScene();

    EventBus.on('battle:updated', this.onBattleUpdated);
    EventBus.on('battle:card_played', this.onCardPlayed);
    EventBus.on('battle:unit_attacked', this.onUnitAttacked);
    EventBus.on('battle:finished', this.onBattleFinished);

    this.preloadTextures(() => {
      // apply battlefield background
      const bfSF = this.getBattlefieldSF();
      if (bfSF && this._tableNode?.isValid) {
        const oldG = this._tableNode.getComponent(Graphics);
        if (oldG) { oldG.clear(); this._tableNode.removeComponent(oldG); }
        const sp = this._tableNode.addComponent(Sprite);
        sp.spriteFrame = bfSF;
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
      }
      this.refreshHUD();
    });
  }

  start() {
    if (this.deckSelectPanel) this.deckSelectPanel.active = true;
  }

  onDestroy() {
    try {
      EventBus.off('battle:updated', this.onBattleUpdated);
      EventBus.off('battle:card_played', this.onCardPlayed);
      EventBus.off('battle:unit_attacked', this.onUnitAttacked);
      EventBus.off('battle:finished', this.onBattleFinished);
      if (this.playBtn?.isValid) this.playBtn.off(Node.EventType.TOUCH_END, this.onPlayCardTap, this);
      if (this.attackBtn?.isValid) this.attackBtn.off(Node.EventType.TOUCH_END, this.onAttackTap, this);
      if (this.endTurnBtn?.isValid) this.endTurnBtn.off(Node.EventType.TOUCH_END, this.onEndTurnTap, this);
    } catch (_e) { /* ignore cleanup errors */ }
  }

  /* ================ controls ================ */

  private onPlayCardTap(_e?: EventTouch) {
    if (!this._battle || this._battle.phase === 'finished' || this._battle.currentTurn !== 'player' || this._busy) return;
    const selectedCard = this.getSelectedHandCard();
    const selectedTarget = this.getSelectedTarget();
    if (!selectedCard) {
      if (this.resultLabel) { this.resultLabel.string = '没有选中手牌'; this.resultLabel.color = new Color(255, 160, 100); }
      return;
    }
    const result = this._battle.playCard('player', selectedCard.instanceId, selectedTarget?.instanceId);
    if (!result.ok && this.resultLabel) {
      this.resultLabel.string = result.reason ?? '出牌失败';
      this.resultLabel.color = new Color(255, 160, 100);
    }
  }

  private onAttackTap(_e?: EventTouch) {
    if (!this._battle || this._battle.phase === 'finished' || this._battle.currentTurn !== 'player' || this._busy) return;
    const attacker = this.getSelectedAttacker();
    const target = this.getSelectedTarget();
    if (!attacker) {
      if (this.resultLabel) { this.resultLabel.string = '没有选中攻击者'; this.resultLabel.color = new Color(255, 160, 100); }
      return;
    }
    const result = this._battle.attackUnit('player', attacker.instanceId, target?.instanceId);
    if (!result.ok && this.resultLabel) {
      this.resultLabel.string = result.reason ?? '攻击失败';
      this.resultLabel.color = new Color(255, 160, 100);
    }
  }

  private onEndTurnTap(_e?: EventTouch) {
    if (!this._battle || this._battle.phase === 'finished' || this._battle.currentTurn !== 'player' || this._busy) return;
    this._busy = true;
    this.appendLog('--- 你结束回合 ---');
    this._battle!.endTurn();
    this.showTurnBanner('对手回合', new Color(255, 140, 140), false);
    this.runEnemyTurn();
  }

  private runEnemyTurn() {
    if (!this._battle || this._battle.phase === 'finished') { this._busy = false; return; }
    if (this.resultLabel) { this.resultLabel.string = '对手出牌中...'; this.resultLabel.color = new Color(255, 180, 180); }
    this.autoPlayAllCards('enemy');
    this.refreshHUD();
    this.dly(0.6, () => {
      if (!this._battle || this._battle.phase === 'finished') { this._busy = false; return; }
      if (this.resultLabel) { this.resultLabel.string = '对手攻击中...'; }
      this.autoAttackAllUnits('enemy');
      this.refreshHUD();
    });
    this.dly(1.2, () => {
      if (!this._battle || this._battle.phase === 'finished') { this._busy = false; return; }
      this.appendLog('--- 对手结束回合 ---');
      this._battle!.endTurn();
      this.refreshHUD();
      this._busy = false;
      if (this._battle.phase !== 'finished') {
        this.showTurnBanner(`回合 ${this._battle.round} — 你的回合`, new Color(120, 255, 160));
      }
    });
  }

  /* ================ events ================ */

  private onBattleUpdated = () => this.refreshHUD();

  private onCardPlayed = (payload?: { actor?: 'player' | 'enemy'; card?: { definition?: { name?: string; cost?: number; attack?: number; health?: number; camp?: string; type?: string } } }) => {
    if (!payload || !this.resultLabel) return;
    const actorText = payload.actor === 'player' ? '你' : '对手';
    const def = payload.card?.definition;
    const name = def?.name ?? '未知卡牌';
    this.resultLabel.string = `${actorText}打出了 ${name}`;
    this.resultLabel.color = payload.actor === 'player' ? new Color(255, 230, 120) : new Color(180, 220, 255);
    const rn = this.resultLabel.node;
    rn.setScale(new Vec3(0.5, 0.5, 1));
    tween(rn).to(0.15, { scale: new Vec3(1.05, 1.05, 1) }, { easing: 'backOut' }).to(0.1, { scale: new Vec3(1, 1, 1) }).start();
    this.appendLog(`${actorText}打出 ${name}`);

    // fly animation: create temp card at hand area, fly to board
    if (def) {
      const isPlayer = payload.actor === 'player';
      const startY = isPlayer ? -140 : 270;
      const endY = isPlayer ? 10 : 150;
      const flyCard = this.createCardNode(
        def.name ?? '?', def.cost ?? 0, def.attack, def.health,
        def.camp ?? 'neutral', def.type ?? 'unit', this.node, false, true,
      );
      flyCard.setPosition(0, startY, 0);
      flyCard.setScale(new Vec3(0.6, 0.6, 1));
      tween(flyCard)
        .to(0.35, { position: new Vec3(0, endY, 0), scale: new Vec3(1.1, 1.1, 1) }, { easing: 'cubicOut' })
        .to(0.1, { scale: new Vec3(0, 0, 1) })
        .call(() => { if (flyCard.isValid) flyCard.destroy(); })
        .start();
    }
  };

  private onUnitAttacked = (payload?: { actor?: 'player' | 'enemy'; direct?: boolean; attacker?: { definition?: { name?: string } }; defender?: { definition?: { name?: string } } | null }) => {
    if (!payload) return;
    if (this.resultLabel) {
      const actorText = payload.actor === 'player' ? '你' : '对手';
      this.resultLabel.string = payload.direct ? `${actorText}发动了直接攻击` : `${actorText}的单位发起了战斗`;
      const atkName = payload.attacker?.definition?.name ?? '单位';
      const defName = payload.direct ? '对方玩家' : (payload.defender?.definition?.name ?? '单位');
      this.appendLog(`${actorText} ${atkName} → ${defName}`);
      this.resultLabel.color = payload.actor === 'player' ? new Color(120, 255, 160) : new Color(255, 140, 140);
      const rn = this.resultLabel.node;
      rn.setScale(new Vec3(0.3, 0.3, 1));
      tween(rn).to(0.2, { scale: new Vec3(1.15, 1.15, 1) }, { easing: 'backOut' }).to(0.1, { scale: new Vec3(1, 1, 1) }).start();
    }

    // attack rush animation
    const isPlayer = payload.actor === 'player';
    const boardNodes = isPlayer ? this._playerBoardNodes : this._enemyBoardNodes;
    if (boardNodes.length > 0) {
      const atkIdx = isPlayer ? this._selectedAttackerIndex : 0;
      const atkNode = boardNodes[Math.min(atkIdx, boardNodes.length - 1)];
      if (atkNode?.isValid) {
        const origPos = atkNode.position.clone();
        const rushY = isPlayer ? 60 : -60;
        tween(atkNode)
          .to(0.12, { position: new Vec3(origPos.x, origPos.y + rushY, 0) }, { easing: 'cubicOut' })
          .to(0.08, { position: new Vec3(origPos.x, origPos.y + rushY - 8, 0) })
          .to(0.15, { position: origPos }, { easing: 'bounceOut' })
          .start();
      }
    }

    // impact flash on target side
    const flashNode = new Node('Flash'); flashNode.parent = this.node;
    flashNode.addComponent(UITransform).setContentSize(new Size(120, 40));
    flashNode.layer = this.node.layer;
    flashNode.setPosition(0, isPlayer ? 150 : 10, 0);
    const flashLbl = this.mkLabel('FLbl', 0, 0, 18, new Color(255, 80, 80), flashNode);
    flashLbl.isBold = true;
    flashLbl.string = payload.direct ? '💥 直击!' : '⚔ 战斗!';
    flashNode.setScale(new Vec3(0, 0, 1));
    tween(flashNode)
      .to(0.15, { scale: new Vec3(1.3, 1.3, 1) }, { easing: 'backOut' })
      .to(0.1, { scale: new Vec3(1, 1, 1) })
      .delay(0.3)
      .to(0.15, { scale: new Vec3(0, 0, 1) })
      .call(() => { if (flashNode.isValid) flashNode.destroy(); })
      .start();

    if (this.detailLabel) {
      const playerBoardCount = this._battle?.playerState.board.filter(Boolean).length ?? 0;
      const enemyBoardCount = this._battle?.enemyState.board.filter(Boolean).length ?? 0;
      this.detailLabel.string = `你 场上${playerBoardCount}/声誉${this._battle?.playerState.reputation ?? 0} | 敌 场上${enemyBoardCount}/声誉${this._battle?.enemyState.reputation ?? 0}`;
    }
  };

  private onBattleFinished = () => {
    if (!this._battle || !this.resultLabel) return;
    const pRep = this._battle.playerState.reputation;
    const eRep = this._battle.enemyState.reputation;
    const w = eRep <= 0 || pRep > eRep;
    const d = pRep === eRep;
    const verdict = d ? '平局!' : w ? '你赢了!' : '对手获胜';
    this.resultLabel.string = `${verdict}  (声誉 ${pRep} : ${eRep}  回合${this._battle.round})`;
    this.appendLog(`--- ${verdict} (${pRep}:${eRep}) ---`);
    this.resultLabel.color = w ? new Color(100, 255, 150) : d ? new Color(200, 200, 200) : new Color(255, 120, 120);
    if (this.endPanel) {
      this.endPanel.active = true; this.endPanel.setScale(new Vec3(0, 0, 1));
      tween(this.endPanel).to(0.3, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
    }
  };

  /* ================ end-game ================ */

  private onRestart() {
    if (this.endPanel) this.endPanel.active = false;
    if (this.deckSelectPanel) this.deckSelectPanel.active = true;
  }

  private onBackToMain() { director.loadScene('MainScene'); }

  /* ================ HUD ================ */

  private refreshHUD() {
    if (!this._battle) return;
    if (this.roundLabel) this.roundLabel.string = `回合 ${this._battle.round}/${this._battle.maxRounds}`;
    if (this.scoreLabel) this.scoreLabel.string = `${this._battle.playerState.reputation}  :  ${this._battle.enemyState.reputation}`;
    if (this.turnLabel) this.turnLabel.string = this._battle.phase === 'finished' ? '结束' : this._battle.currentTurn === 'player' ? '你的回合' : '对手回合...';
    // visual card rendering
    this.renderCardVisuals();
    if (this.actionHintLabel) {
      this.actionHintLabel.string = `${this.summarizeNextAction('player')} | ${this.summarizeNextAction('enemy')}`;
    }
    if (this.selectionLabel) {
      const selectedCard = this.getSelectedHandCard();
      const selectedAttacker = this.getSelectedAttacker();
      const selectedTarget = this.getSelectedTarget();
      const cardText = selectedCard ? `选中手牌: ${selectedCard.definition.name}[${selectedCard.definition.cost}] ${selectedCard.definition.text ?? ''}` : '选中手牌: -';
      const attackerText = selectedAttacker ? `攻击者: ${selectedAttacker.definition.name}` : '攻击者: -';
      const targetText = selectedTarget ? `目标: ${selectedTarget.definition.name}` : '目标: 直伤/无目标';
      this.selectionLabel.string = `${cardText} | ${attackerText} | ${targetText}`;
    }
    if (this.detailLabel) {
      const playerBoardCount = this._battle.playerState.board.filter(Boolean).length;
      const enemyBoardCount = this._battle.enemyState.board.filter(Boolean).length;
      this.detailLabel.string = `你 手牌${this._battle.playerState.hand.length}/场上${playerBoardCount}/牌库${this._battle.playerState.deck.length}/热度${this._battle.playerState.heat}/行动${this._battle.playerState.actionPoints} | 敌 手牌${this._battle.enemyState.hand.length}/场上${enemyBoardCount}/牌库${this._battle.enemyState.deck.length}/热度${this._battle.enemyState.heat}/行动${this._battle.enemyState.actionPoints}`;
    }
    if (this.resultLabel && this._battle.phase === 'main' && this._battle.currentTurn === 'player' && !this._busy) {
      this.resultLabel.string = '点击按钮：出牌 / 攻击 / 结束回合';
      this.resultLabel.color = new Color(255, 255, 100);
    }
    const canAct = this._battle.phase === 'main' && this._battle.currentTurn === 'player' && !this._busy;
    const btnAlpha = canAct ? 255 : 100;
    [this.playBtn, this.attackBtn, this.endTurnBtn].forEach((btn) => {
      if (!btn) return;
      const lbl = btn.getComponentInChildren(Label);
      if (lbl) lbl.color = new Color(lbl.color.r, lbl.color.g, lbl.color.b, btnAlpha);
    });
  }
}
