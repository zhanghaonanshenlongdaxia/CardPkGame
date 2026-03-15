import { _decorator, Color, Component, EventTouch, Graphics, Label, Node, tween, UITransform, Vec3, Size, director } from 'cc';
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

  private dly(s: number, cb: () => void) { setTimeout(cb, s * 1000); }

  private appendLog(msg: string) {
    this._battleLog.push(msg);
    if (this._battleLog.length > 6) this._battleLog.shift();
    if (this.logLabel) this.logLabel.string = this._battleLog.join('\n');
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
    const tg = this.gfx('Table', this.node, 900, 440, 0, 50);
    tg.fillColor = new Color(40, 70, 45);
    tg.roundRect(-450, -220, 900, 440, 24); tg.fill();
    tg.strokeColor = new Color(85, 62, 42); tg.lineWidth = 8;
    tg.roundRect(-450, -220, 900, 440, 24); tg.stroke();
    // inner border
    tg.strokeColor = new Color(55, 90, 58, 100); tg.lineWidth = 1.5;
    tg.roundRect(-435, -205, 870, 410, 18); tg.stroke();

    // ==== top HUD ====
    const topG = this.gfx('Top', this.node, W, 56, 0, H / 2 - 28);
    topG.fillColor = new Color(10, 20, 45, 230);
    topG.rect(-W / 2, -28, W, 56); topG.fill();
    this.roundLabel = this.mkLabel('Rnd', -300, H / 2 - 28, 20, new Color(180, 200, 220));
    this.scoreLabel = this.mkLabel('Scr', 0, H / 2 - 28, 34, Color.WHITE);
    this.turnLabel  = this.mkLabel('Trn', 300, H / 2 - 28, 18, new Color(180, 255, 180));
    this.enemyHandLabel = this.mkLabel('EnemyHand', 0, 280, 15, new Color(215, 225, 255));
    this.enemyBoardLabel = this.mkLabel('EnemyBoard', 0, 210, 17, new Color(255, 210, 210));
    this.playerBoardLabel = this.mkLabel('PlayerBoard', 0, -140, 17, new Color(210, 255, 210));
    this.playerHandLabel = this.mkLabel('PlayerHand', 0, -80, 15, new Color(255, 235, 180));

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
    });
  }

  /* ================ events ================ */

  private onBattleUpdated = () => this.refreshHUD();

  private onCardPlayed = (payload?: { actor?: 'player' | 'enemy'; card?: { definition?: { name?: string } } }) => {
    if (!payload || !this.resultLabel) return;
    const actorText = payload.actor === 'player' ? '你' : '对手';
    const name = payload.card?.definition?.name ?? '未知卡牌';
    this.resultLabel.string = `${actorText}打出了 ${name}`;
    this.resultLabel.color = payload.actor === 'player' ? new Color(255, 230, 120) : new Color(180, 220, 255);
    const rn = this.resultLabel.node;
    rn.setScale(new Vec3(0.5, 0.5, 1));
    tween(rn).to(0.15, { scale: new Vec3(1.05, 1.05, 1) }, { easing: 'backOut' }).to(0.1, { scale: new Vec3(1, 1, 1) }).start();
    this.appendLog(`${actorText}打出 ${name}`);
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
    if (this.enemyHandLabel) this.enemyHandLabel.string = this.summarizeHand('enemy');
    const enemyStrats = this.summarizeStrategies('enemy');
    if (this.enemyBoardLabel) this.enemyBoardLabel.string = this.summarizeBoard('enemy') + (enemyStrats ? `  ${enemyStrats}` : '');
    const playerStrats = this.summarizeStrategies('player');
    if (this.playerBoardLabel) this.playerBoardLabel.string = this.summarizeBoard('player') + (playerStrats ? `  ${playerStrats}` : '');
    if (this.playerHandLabel) this.playerHandLabel.string = this.summarizeHand('player');
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
