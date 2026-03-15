import { _decorator, Color, Component, Graphics, Label, Node, Size, tween, UITransform, Vec2, Vec3, director } from 'cc';
import { GameInstaller } from '../installers/GameInstaller';

const { ccclass } = _decorator;

@ccclass('MainScene')
export class MainScene extends Component {
  private titleLabel: Label | null = null;
  private tipLabel: Label | null = null;
  private btnStart: Node | null = null;

  onLoad() {
    this.buildUI();
  }

  start() {
    GameInstaller.install();
    if (this.titleLabel) this.titleLabel.string = '卡牌对战';
    if (this.tipLabel)  this.tipLabel.string = '1v1 经典对战';

    // entrance animations
    this.playEntranceAnim();
  }

  /* ========== UI construction ========== */

  private buildUI() {
    const L = this.node.layer;

    // --- full-screen background ---
    const bg = new Node('Bg');
    bg.parent = this.node;
    bg.addComponent(UITransform).setContentSize(new Size(1280, 720));
    bg.setPosition(0, 0, 0);
    bg.layer = L;
    const bgGfx = bg.addComponent(Graphics);
    // gradient-like fill: draw two rects
    bgGfx.fillColor = new Color(25, 42, 86);
    bgGfx.rect(-640, -360, 1280, 720);
    bgGfx.fill();
    // lighter strip at top
    bgGfx.fillColor = new Color(35, 58, 108);
    bgGfx.rect(-640, 60, 1280, 300);
    bgGfx.fill();

    // --- decorative card shapes ---
    this.createDecoRect(-380, 180, 60, 85, new Color(255, 220, 80, 60));
    this.createDecoRect(350, -160, 50, 70, new Color(100, 180, 255, 50));
    this.createDecoRect(-250, -200, 45, 65, new Color(255, 100, 100, 45));
    this.createDecoRect(420, 200, 55, 78, new Color(200, 255, 150, 40));
    this.createDecoRect(-460, -50, 40, 56, new Color(255, 180, 100, 35));
    this.createDecoRect(200, 250, 48, 68, new Color(160, 120, 255, 40));

    // --- title ---
    const titleNode = new Node('Title');
    titleNode.parent = this.node;
    titleNode.addComponent(UITransform).setContentSize(new Size(600, 100));
    titleNode.setPosition(0, 120, 0);
    titleNode.layer = L;
    this.titleLabel = titleNode.addComponent(Label);
    this.titleLabel.fontSize = 72;
    this.titleLabel.lineHeight = 78;
    this.titleLabel.color = new Color(255, 220, 80);
    this.titleLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    this.titleLabel.verticalAlign = Label.VerticalAlign.CENTER;
    this.titleLabel.isBold = true;
    this.titleLabel.string = '';

    // --- subtitle / tip ---
    const tipNode = new Node('Tip');
    tipNode.parent = this.node;
    tipNode.addComponent(UITransform).setContentSize(new Size(600, 50));
    tipNode.setPosition(0, 40, 0);
    tipNode.layer = L;
    this.tipLabel = tipNode.addComponent(Label);
    this.tipLabel.fontSize = 26;
    this.tipLabel.lineHeight = 30;
    this.tipLabel.color = new Color(180, 200, 230);
    this.tipLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    this.tipLabel.string = '';

    // --- start button ---
    this.btnStart = new Node('BtnStart');
    this.btnStart.parent = this.node;
    const btnUt = this.btnStart.addComponent(UITransform);
    btnUt.setContentSize(new Size(280, 70));
    btnUt.setAnchorPoint(new Vec2(0.5, 0.5));
    this.btnStart.setPosition(0, -80, 0);
    this.btnStart.layer = L;
    const btnGfx = this.btnStart.addComponent(Graphics);
    btnGfx.fillColor = new Color(60, 170, 90);
    btnGfx.roundRect(-140, -35, 280, 70, 14);
    btnGfx.fill();
    btnGfx.strokeColor = new Color(100, 220, 130);
    btnGfx.lineWidth = 2;
    btnGfx.roundRect(-140, -35, 280, 70, 14);
    btnGfx.stroke();

    const btnLblNode = new Node('BtnStartLbl');
    btnLblNode.parent = this.btnStart;
    btnLblNode.addComponent(UITransform).setContentSize(new Size(280, 70));
    btnLblNode.setPosition(0, 0, 0);
    btnLblNode.layer = L;
    const btnLbl = btnLblNode.addComponent(Label);
    btnLbl.fontSize = 32;
    btnLbl.lineHeight = 36;
    btnLbl.color = Color.WHITE;
    btnLbl.isBold = true;
    btnLbl.string = '开始对战';
    btnLbl.horizontalAlign = Label.HorizontalAlign.CENTER;
    btnLbl.verticalAlign = Label.VerticalAlign.CENTER;

    this.btnStart.on(Node.EventType.TOUCH_END, this.onStartClick, this);

    // --- version / footer ---
    const footer = new Node('Footer');
    footer.parent = this.node;
    footer.addComponent(UITransform).setContentSize(new Size(400, 30));
    footer.setPosition(0, -300, 0);
    footer.layer = L;
    const ftLbl = footer.addComponent(Label);
    ftLbl.fontSize = 16;
    ftLbl.lineHeight = 20;
    ftLbl.color = new Color(100, 120, 150);
    ftLbl.string = 'Card PK v0.1';
    ftLbl.horizontalAlign = Label.HorizontalAlign.CENTER;

    // --- decorative card icon ---
    const cardIcon = new Node('CardIcon');
    cardIcon.parent = this.node;
    const ciUt = cardIcon.addComponent(UITransform);
    ciUt.setContentSize(new Size(80, 110));
    cardIcon.setPosition(0, -180, 0);
    cardIcon.layer = L;
    const ciGfx = cardIcon.addComponent(Graphics);
    ciGfx.fillColor = new Color(255, 220, 80, 90);
    ciGfx.roundRect(-40, -55, 80, 110, 6);
    ciGfx.fill();
    ciGfx.strokeColor = new Color(255, 200, 60, 140);
    ciGfx.lineWidth = 2;
    ciGfx.roundRect(-40, -55, 80, 110, 6);
    ciGfx.stroke();
    // card center symbol
    ciGfx.fillColor = new Color(200, 160, 40, 100);
    ciGfx.circle(0, 0, 18);
    ciGfx.fill();
  }

  private createDecoRect(x: number, y: number, w: number, h: number, color: Color) {
    const n = new Node('Deco');
    n.parent = this.node;
    n.addComponent(UITransform).setContentSize(new Size(w, h));
    n.setPosition(x, y, 0);
    n.layer = this.node.layer;
    const gfx = n.addComponent(Graphics);
    gfx.fillColor = color;
    gfx.roundRect(-w / 2, -h / 2, w, h, 4);
    gfx.fill();
    // slow floating animation
    const offset = (Math.random() - 0.5) * 20;
    tween(n)
      .by(2 + Math.random() * 2, { position: new Vec3(0, offset, 0) }, { easing: 'sineInOut' })
      .by(2 + Math.random() * 2, { position: new Vec3(0, -offset, 0) }, { easing: 'sineInOut' })
      .union()
      .repeatForever()
      .start();
  }

  /* ========== entrance animations ========== */

  private playEntranceAnim() {
    if (this.titleLabel) {
      const tn = this.titleLabel.node;
      tn.setPosition(0, 300, 0);
      tn.setScale(new Vec3(0.6, 0.6, 1));
      tween(tn)
        .to(0.5, { position: new Vec3(0, 120, 0), scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
        .start();
    }
    if (this.tipLabel) {
      const tn = this.tipLabel.node;
      tn.setScale(new Vec3(0, 0, 1));
      tween(tn)
        .delay(0.3)
        .to(0.3, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
        .start();
    }
    if (this.btnStart) {
      this.btnStart.setScale(new Vec3(0, 0, 1));
      tween(this.btnStart)
        .delay(0.5)
        .to(0.35, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
        .start();
    }
  }

  /* ========== button handler ========== */

  private onStartClick() {
    if (this.btnStart) {
      tween(this.btnStart)
        .to(0.08, { scale: new Vec3(0.92, 0.92, 1) })
        .to(0.08, { scale: new Vec3(1, 1, 1) })
        .call(() => director.loadScene('BattleScene'))
        .start();
    } else {
      director.loadScene('BattleScene');
    }
  }

  onDestroy() {
    if (this.btnStart && this.btnStart.isValid) {
      this.btnStart.off(Node.EventType.TOUCH_END, this.onStartClick, this);
    }
  }
}
