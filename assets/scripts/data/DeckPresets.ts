/**
 * 预设牌组定义
 * 每个牌组包含一个 cardId 列表（可重复，受 deckLimit 限制）
 */

export interface DeckPreset {
  id: string;
  name: string;
  camp: string;
  description: string;
  cards: string[];
}

export const DeckPresets: DeckPreset[] = [
  {
    id: 'hotspot_aggro',
    name: '热搜速攻',
    camp: 'hotspot',
    description: '快速积累热度，以爆发伤害终结对手。',
    cards: [
      'hotspot_001', 'hotspot_001', 'hotspot_001',
      'hotspot_002', 'hotspot_002',
      'hotspot_003', 'hotspot_003',
      'hotspot_009', 'hotspot_009',
      'hotspot_005', 'hotspot_005',
      'hotspot_006', 'hotspot_006', 'hotspot_006',
      'hotspot_011', 'hotspot_011', 'hotspot_011',
      'hotspot_007', 'hotspot_007',
      'hotspot_008',
      'neutral_004', 'neutral_004',
    ],
  },
  {
    id: 'hotspot_burn',
    name: '热搜燃烧',
    camp: 'hotspot',
    description: '极限堆热度，搭配榜一话题疯狂打脸。',
    cards: [
      'hotspot_001', 'hotspot_001', 'hotspot_001',
      'hotspot_004', 'hotspot_004',
      'hotspot_005', 'hotspot_005',
      'hotspot_009', 'hotspot_009', 'hotspot_009',
      'hotspot_006', 'hotspot_006', 'hotspot_006',
      'hotspot_010', 'hotspot_010',
      'hotspot_011', 'hotspot_011', 'hotspot_011',
      'hotspot_007', 'hotspot_007',
      'hotspot_008',
    ],
  },
  {
    id: 'moderation_control',
    name: '管控压制',
    camp: 'moderation',
    description: '压制敌方热度，用沉默和控制拖慢节奏取胜。',
    cards: [
      'moderation_001', 'moderation_001', 'moderation_001',
      'moderation_002', 'moderation_002',
      'moderation_003', 'moderation_003',
      'moderation_004', 'moderation_004',
      'moderation_005', 'moderation_005',
      'moderation_006', 'moderation_006', 'moderation_006',
      'moderation_007', 'moderation_007',
      'moderation_009', 'moderation_009',
      'moderation_008',
      'neutral_003', 'neutral_003',
    ],
  },
  {
    id: 'moderation_fortress',
    name: '管控堡垒',
    camp: 'moderation',
    description: '厚甲高防，护盾叠加，磨死对手。',
    cards: [
      'moderation_001', 'moderation_001',
      'moderation_002', 'moderation_002',
      'moderation_003', 'moderation_003', 'moderation_003',
      'moderation_004', 'moderation_004',
      'moderation_005', 'moderation_005',
      'moderation_010', 'moderation_010',
      'moderation_011', 'moderation_011', 'moderation_011',
      'moderation_008',
      'neutral_003', 'neutral_003', 'neutral_003',
      'neutral_016',
    ],
  },
  {
    id: 'evidence_midrange',
    name: '实锤中速',
    camp: 'evidence',
    description: '稳步积累证据，在关键时刻一击毙命。',
    cards: [
      'evidence_001', 'evidence_001', 'evidence_001',
      'evidence_002', 'evidence_002',
      'evidence_003', 'evidence_003',
      'evidence_004', 'evidence_004',
      'evidence_009', 'evidence_009',
      'evidence_006', 'evidence_006', 'evidence_006',
      'evidence_007', 'evidence_007',
      'evidence_008',
      'neutral_001', 'neutral_001',
      'neutral_012', 'neutral_012',
    ],
  },
  {
    id: 'evidence_rush',
    name: '速锤打击',
    camp: 'evidence',
    description: '快速堆证据，尽早触发实锤通报消灭敌方。',
    cards: [
      'evidence_001', 'evidence_001', 'evidence_001',
      'evidence_003', 'evidence_003', 'evidence_003',
      'evidence_005', 'evidence_005',
      'evidence_009', 'evidence_009', 'evidence_009',
      'evidence_006', 'evidence_006', 'evidence_006',
      'evidence_010', 'evidence_010',
      'evidence_011', 'evidence_011', 'evidence_011',
      'evidence_007', 'evidence_007',
      'evidence_008',
    ],
  },
  {
    id: 'neutral_balanced',
    name: '中立均衡',
    camp: 'neutral',
    description: '灵活应对各种局面，攻守兼备。',
    cards: [
      'neutral_001', 'neutral_001', 'neutral_001',
      'neutral_002', 'neutral_002',
      'neutral_003', 'neutral_003',
      'neutral_004', 'neutral_004', 'neutral_004',
      'neutral_005', 'neutral_005',
      'neutral_006', 'neutral_006',
      'neutral_007', 'neutral_007',
      'neutral_009', 'neutral_009',
      'neutral_010', 'neutral_010',
      'neutral_013',
    ],
  },
];
