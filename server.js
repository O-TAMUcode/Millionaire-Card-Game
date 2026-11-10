'use strict';
// 大富豪オンライン 単一ファイル版: node server.js だけで動きます（依存パッケージなし）
const G = (function () {
const module = { exports: {} };
// 大富豪ゲームエンジン（サーバー側で権威的に判定）
// カード: {id, s:'S'|'H'|'D'|'C'|'X', r:3..15(14=A,15=2), 16=Joker}
// ローカルルールの一覧は https://boardgamegarden.blogspot.com/2012/08/blog-post_4312.html を元にしています。
// ★は「よく使うルール度」(★5=よく使う, ★1=あまり使わない)

const SUITS = ['S', 'H', 'D', 'C'];
const SYM = { S: '♠', H: '♥', D: '♦', C: '♣' };
const LABEL = { 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2', 16: 'JK' };
const isJ = (c) => c.r === 16;
const isRed = (c) => c.s === 'H' || c.s === 'D';
const isD3 = (c) => c.s === 'D' && c.r === 3;
const GUILLOTINE_N = 20;

// ---- ルール一覧 ----------------------------------------------------------
const G_CARD = 'カードの効果', G_REV = '革命', G_LOCK = '縛り', G_PLAY = '出し方', G_OTHER = '順位・交換・その他';
const RULE_LIST = [
  { id: 'eight', name: '8切り', stars: 5, group: G_CARD, def: true, desc: '8を出すと場が流れ、同じ人がもう一度出す。' },
  { id: 'spade3', name: 'スペ3返し', stars: 5, group: G_CARD, def: true, desc: 'ジョーカー単体には♠3単体で勝てる。' },
  { id: 'jBack', name: 'Jバック（11バック）', stars: 5, group: G_CARD, desc: 'Jを出すと、その場が流れるまで強さが逆転する。' },
  { id: 'jBack3', name: '強化Jバック', stars: 5, group: G_CARD, desc: 'Jを3枚出すと、この場に加えて次の場も強さが逆転する。（Jバックと併用）' },
  { id: 'revolution', name: '革命', stars: 5, group: G_REV, def: true, desc: '同じ数字を4枚以上出すと、強さが逆転する。' },
  { id: 'revBack', name: '革命返し', stars: 5, group: G_REV, def: true, desc: '革命中にもう一度革命を起こすと、強さが元に戻る。' },
  { id: 'stairRev', name: '階段革命（5枚以上）', stars: 5, group: G_REV, def: true, desc: '階段を5枚以上で出すと革命になる。' },
  { id: 'stairRev3', name: '階段革命（3枚以上）', stars: 5, group: G_REV, desc: '階段を3枚以上で出すと革命になる。' },
  { id: 'lock', name: '縛り（両シバ含む）', stars: 5, group: G_LOCK, def: true, desc: '場と同じマークを連続して出すと、以降そのマークしか出せない。2枚以上なら同じマークの組（両シバ）。' },
  { id: 'gekishiba', name: '激シバ（連シバ）', stars: 5, group: G_LOCK, desc: '縛りに加えて、続きの数字（+1）で同じマークを出すと、以降も続きの数字でしか出せない（1枚出し）。' },
  { id: 'ryogeki', name: '両激シ', stars: 4, group: G_LOCK, desc: '2枚以上の両シバが続きの数字で成立すると、以降も続きの数字でしか出せない。' },
  { id: 'katashiba', name: '片シバ', stars: 4, group: G_LOCK, desc: '場が2枚以上のとき、場と一部のマークだけが重なっても縛りになる。以降は共通マークを1枚含めば出せる。' },
  { id: 'tobiShiba', name: '飛び縛り', stars: 3, group: G_LOCK, desc: '飛び連番でも縛りが発生する。' },
  { id: 'stairs', name: '階段', stars: 4, group: G_PLAY, def: true, desc: '同じマークの連続する数字を3枚以上で出せる。' },
  { id: 'tobi', name: '飛び連番', stars: 3, group: G_PLAY, desc: '3・5・7や4・7・10のように一定間隔の同マーク3枚以上を出せる。' },
  { id: 'emperor', name: 'エンペラー', stars: 3, group: G_PLAY, desc: '4枚すべて違うマークの連続する数字も階段として出せる。' },
  { id: 'dignity', name: '威厳', stars: 0, group: G_PLAY, desc: 'J・Q・Kを含む階段が8切りと同じ効果になる。' },
  { id: 'guerrilla', name: 'ゲリラ兵', stars: 2, group: G_PLAY, desc: '場と同じ数字を、場より多い枚数で出せる。' },
  { id: 'd3start', name: 'ダイヤの3スタート', stars: 4, group: G_CARD, desc: '最初のラウンドはダイヤの3を持つ人から始め、その最初の手にダイヤの3を含める。' },
  { id: 'yamiichi', name: '闇市', stars: 1, group: G_CARD, desc: 'Aを3枚出すと、手札の弱い2枚を渡して相手の最強2枚をもらう。（相手は自動で選ばれます）' },
  { id: 'nextAce', name: '次期エース', stars: 2, group: G_CARD, desc: '場が流れたとき、その場で最後にAを出した人から次を始める。' },
  { id: 'back2', name: '2バック', stars: 1, group: G_CARD, desc: '2を出すと、その場が流れるまで強さが逆転する。' },
  { id: 'daikaku', name: '大革命（2を4枚で勝利）', stars: 3, group: G_CARD, desc: '2を4枚出した時点でその人が大富豪になり、ラウンド終了。' },
  { id: 'sanSan', name: '3三返し', stars: 3, group: G_CARD, desc: 'ジョーカー単体に、3を3枚で勝てる。' },
  { id: 'sunaarashi', name: '砂嵐', stars: 3, group: G_CARD, desc: '3を3枚出すと、どんな場にも出せる。' },
  { id: 'zombie', name: 'ゾンビ', stars: 1, group: G_CARD, desc: '3を3枚出すと、捨て札の弱い1枚を次の人に押し付ける。' },
  { id: 'stop4', name: '4止め', stars: 1, group: G_CARD, desc: '8切り（1枚）に対して、4の2枚出しで切りを止められる。' },
  { id: 'cut4', name: '4切り', stars: 1, group: G_CARD, desc: '4を出すと場が流れ、同じ人がもう一度出す。' },
  { id: 'death', name: 'DEATH', stars: 1, group: G_CARD, desc: '4を3枚出すと、自分以外の全員が最強の1枚を捨てる。' },
  { id: 'skip5', name: '5スキップ', stars: 2, group: G_CARD, desc: '5を出した枚数だけ次の人を飛ばす。' },
  { id: 'color5', name: '5番目の色', stars: 2, group: G_CARD, desc: '5を出すと、そのマークしか出せなくなる。' },
  { id: 'red5', name: '赤い5', stars: 1, group: G_CARD, desc: '赤の5を出すと、ランダムな1人と手札を混ぜて均等に分け直す。' },
  { id: 'back6', name: '6戻し', stars: 2, group: G_CARD, desc: 'Jバック・2バック中に6を出すと、強さが元に戻る。' },
  { id: 'satan', name: 'サタン', stars: 1, group: G_CARD, desc: '6を3枚出すと、捨て札から最強の1枚をもらう。' },
  { id: 'cutRev6', name: '6切り', stars: 3, group: G_CARD, desc: '革命中は8の代わりに6で場を切る。' },
  { id: 'cutRev7', name: '7切り', stars: 1, group: G_CARD, desc: '革命中は8の代わりに7で場を切る。' },
  { id: 'pass7', name: '7渡し', stars: 3, group: G_CARD, desc: '7を出した枚数だけ、手札の弱い札を次の人に渡す。' },
  { id: 'lucky7', name: 'ラッキーセブン', stars: 1, group: G_CARD, desc: '7を3枚出し、誰も出せなければその人が大富豪になる。' },
  { id: 'd7', name: 'ダイヤ7カウンター', stars: 1, group: G_CARD, desc: '8切り（1枚）に対して、♦7単体で切りを止められる。' },
  { id: 'black7draw', name: '黒い7', stars: 1, group: G_CARD, desc: '♣/♠の7を出すと、捨て札からランダムに出した枚数だけ引く。' },
  { id: 'red7', name: 'レッドセブン', stars: 1, group: G_CARD, desc: '♥/♦の7が、2より強くジョーカーより弱い札になる。' },
  { id: 'black7', name: 'ブラックセブン', stars: 1, group: G_CARD, desc: '革命中、♣/♠の7が3より強くジョーカーより弱い札になる。' },
  { id: 'eight3', name: '強化8切り', stars: 1, group: G_CARD, desc: '8を3枚で切ると、その場のカードはゲームから消える。' },
  { id: 'reverse9', name: '9リバース', stars: 3, group: G_CARD, desc: '9を出すと順番が逆回りになる。' },
  { id: 'shuffle9', name: '9シャッフル', stars: 2, group: G_CARD, desc: '9を2枚出すと、席順がランダムに入れ替わる。' },
  { id: 'galaxy', name: '銀河鉄道', stars: 1, group: G_CARD, desc: '9を3枚出すと、捨て札から2枚引いて、手札の弱い2枚を捨てる。' },
  { id: 'discard10', name: '10捨て', stars: 3, group: G_CARD, desc: '10を出した枚数だけ、手札の弱い札を捨てられる。' },
  { id: 'reverseQ', name: 'Qリバース', stars: 3, group: G_CARD, desc: 'Qを出すと順番が逆回りになる。' },
  { id: 'loveQ', name: 'Qラブ', stars: 2, group: G_CARD, desc: 'Qを出すと、捨て札から1枚もらう。' },
  { id: 'bloody', name: 'ブラッディメアリ', stars: 2, group: G_CARD, desc: 'Qを3枚出すと、自分以外の全員が最強の2枚を捨てる。' },
  { id: 'jeanne', name: 'ジャンヌ・ダルク', stars: 1, group: G_CARD, desc: 'Qを3枚出すと、次の人が最強の2枚を捨てる。' },
  { id: 'reverseK', name: 'Kリバース', stars: 2, group: G_CARD, desc: 'Kを出すと順番が逆回りになる。' },
  { id: 'skipK', name: 'Kスキップ', stars: 2, group: G_CARD, desc: 'Kを出した枚数だけ次の人を飛ばす。' },
  { id: 'nero', name: 'ネロ', stars: 3, group: G_CARD, desc: 'Kを3枚出すと、他の人の手札から最強の1枚をもらう。' },
  { id: 'arthur', name: 'アーサー', stars: 1, group: G_CARD, desc: 'Kを3枚出すと、以降ジョーカーが10とJの間の強さになる。' },
  { id: 'mlk', name: 'キング牧師', stars: 2, group: G_CARD, desc: 'Kを出すと、全員が手札の最弱の1枚を次の人に渡す。' },
  { id: 'jokerRev', name: 'ジョーカー革命', stars: 3, group: G_REV, desc: 'ジョーカーを含んでも革命が成立する。（通常は成立しない）' },
  { id: 'revNagashi', name: '革命流し', stars: 4, group: G_REV, desc: '8を4枚で起こした革命は、革命返しできない。' },
  { id: 'coup', name: 'クーデター', stars: 2, group: G_REV, desc: '9を3枚で革命できる。' },
  { id: 'omen', name: 'オーメン', stars: 2, group: G_REV, desc: '6を3枚で革命できる。以降は革命も特殊札の効果も縛りも起きなくなる。' },
  { id: 'tobiRev', name: '飛び連番革命', stars: 2, group: G_REV, desc: '飛び連番を4枚以上で出すと革命になる。（飛び連番ルールと併用）' },
  { id: 'revChoice', name: '革命選択', stars: 3, group: G_REV, desc: '革命になる手でも、出す人が「革命しない」を選べる。' },
  { id: 'followRev', name: '追革', stars: 2, group: G_REV, desc: '場のペアと同じ数字のペアを出すと革命になる。' },
  { id: 'superRev', name: '超革命', stars: 2, group: G_REV, desc: '5枚以上で革命すると、そのラウンドは以後革命が起きない。' },
  { id: 'foul2', name: '2上がり', stars: 3, group: G_OTHER, desc: '2を出して上がると、反則で大貧民になる。' },
  { id: 'foul8', name: '8上がり', stars: 3, group: G_OTHER, desc: '8を出して上がると、反則で大貧民になる。' },
  { id: 'foul11', name: '11上がり', stars: 3, group: G_OTHER, desc: 'Jを出して上がると、反則で大貧民になる。' },
  { id: 'foulJoker', name: 'ジョーカー上がり', stars: 3, group: G_OTHER, desc: 'ジョーカーを含む手で上がると、反則で大貧民になる。' },
  { id: 'foulS3', name: 'スペ3上がり', stars: 3, group: G_OTHER, desc: '♠3を出して上がると、反則で大貧民になる。' },
  { id: 'miyako', name: '都落ち', stars: 4, group: G_OTHER, desc: '前回の大富豪が1位になれなかったら、一気に大貧民になる。' },
  { id: 'gekokujo', name: '都上がり・下克上', stars: 3, group: G_OTHER, desc: '前回の大貧民が1位になると、全員の順位が逆転する。' },
  { id: 'daihinMeguri', name: '大貧民巡り', stars: 4, group: G_OTHER, desc: '2周目以降は、前回の大貧民から始める。' },
  { id: 'richRest', name: '大富豪の余裕', stars: 3, group: G_OTHER, desc: '2周目以降、大富豪は最初の1巡は出せない。' },
  { id: 'zettai', name: '絶対王政', stars: 2, group: G_OTHER, desc: '大富豪は、富豪と1枚、貧民と2枚、大貧民と3枚だけ交換する。' },
  { id: 'defense', name: '防衛', stars: 2, group: G_OTHER, desc: '大富豪を守った次の交換は、受け取る/渡す枚数が1枚ずつ増える。' },
  { id: 'tenpen', name: '天変地異', stars: 2, group: G_OTHER, desc: '大貧民/貧民の手札がすべて3〜10なら、交換相手と手札を丸ごと入れ替える。' },
  { id: 'monopoly', name: 'モノポリー', stars: 2, group: G_OTHER, desc: '配られた手札に同じマークの3〜2がすべて揃うと、その人が即大富豪。' },
  { id: 'guillotine', name: 'ギロチン時計', stars: 1, group: G_OTHER, desc: '1ラウンドの通算' + GUILLOTINE_N + '回目のパスをした人は、強制的に大貧民になる。' },
];
const DEFAULT_RULES = {};
for (const r of RULE_LIST) DEFAULT_RULES[r.id] = !!r.def;
function normRules(r) {
  const out = Object.assign({}, DEFAULT_RULES);
  if (r && typeof r === 'object') for (const k of Object.keys(DEFAULT_RULES)) if (typeof r[k] === 'boolean') out[k] = r[k];
  return out;
}
// ページにあるが未対応のルール（UIに表示）
const UNSUPPORTED = ['税収', 'ダミアン', '7付け', '宗教革命', '融合革命', '核爆弾', 'カタパルト', '亰落ち', '物資救援', '独占禁止法', 'どかん'];

const effRev = (g) => g.rev !== !!g.jb;

// ---- 基本ユーティリティ -------------------------------------------------
function makeDeck() {
  const d = [];
  let id = 0;
  for (const s of SUITS) for (let r = 3; r <= 15; r++) d.push({ id: id++, s, r });
  d.push({ id: id++, s: 'X', r: 16 });
  d.push({ id: id++, s: 'X', r: 16 });
  return d;
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function sortHand(h) {
  return h.slice().sort((a, b) => a.r - b.r || SUITS.indexOf(a.s) - SUITS.indexOf(b.s));
}
function cardView(c, as) {
  const v = { id: c.id, s: c.s, r: c.r };
  if (as) v.as = as;
  return v;
}
const err = (e) => ({ ok: false, error: e });
function pushLog(g, s, t) {
  g.log.push({ s, t });
  if (g.log.length > 40) g.log.shift();
}
function ev(g, kind, text, seat) {
  g.events.push({ id: ++g.evSeq, kind, text, seat: seat == null ? -1 : seat });
  if (g.events.length > 12) g.events.shift();
}
function cardPower(g, c) {
  if (isJ(c)) return g.arthur ? (effRev(g) ? 7.5 : 10.5) : 100;
  return effRev(g) ? 18 - c.r : c.r;
}
const activeSeats = (g) => g.order.filter((s) => g.hands[s].length > 0);
function nextActive(g, seat) {
  const o = g.order, n = o.length;
  const idx = o.indexOf(seat);
  for (let k = 1; k <= n; k++) {
    const s = o[(((idx + g.dir * k) % n) + n) % n];
    if (g.hands[s].length > 0) return s;
  }
  return seat;
}

// ---- 手の解釈 ----------------------------------------------------------
// 選んだカードを「同じ数字の組(set)」または「一定間隔の連番(stair, step=1が階段)」として解釈する。
// ジョーカーはワイルド。
function interpretations(cards, rules) {
  const R = rules || DEFAULT_RULES;
  const n = cards.length;
  const res = [];
  if (n === 0) return res;
  const jokers = cards.filter(isJ);
  const nat = cards.filter((c) => !isJ(c));

  if (nat.length === 0) {
    if (n <= 2) res.push({ type: 'set', n, rank: 16, cards, view: cards.map((c) => cardView(c)) });
    return res;
  }
  if (nat.every((c) => c.r === nat[0].r)) {
    const rank = nat[0].r;
    const view = nat
      .slice()
      .sort((a, b) => SUITS.indexOf(a.s) - SUITS.indexOf(b.s))
      .map((c) => cardView(c))
      .concat(jokers.map((j) => cardView(j, rank)));
    res.push({ type: 'set', n, rank, cards, view });
  }
  if (n >= 3 && new Set(nat.map((c) => c.r)).size === nat.length) {
    const sameSuit = nat.every((c) => c.s === nat[0].s);
    const emperor = R.emperor && n === 4 && new Set(nat.map((c) => c.s)).size === nat.length;
    const steps = [];
    if (R.stairs) steps.push(1);
    if (R.tobi) for (let d = 2; d <= 6; d++) steps.push(d);
    for (const d of steps) {
      if (!(sameSuit || (emperor && d === 1))) continue;
      for (let start = 3; start + (n - 1) * d <= 15; start++) {
        const pos = new Map();
        let ok = true;
        for (const c of nat) {
          const k = (c.r - start) / d;
          if (!Number.isInteger(k) || k < 0 || k >= n) { ok = false; break; }
          pos.set(k, c);
        }
        if (!ok) continue;
        const view = [];
        let ji = 0;
        for (let k = 0; k < n; k++) {
          const c = pos.get(k);
          view.push(c ? cardView(c) : cardView(jokers[ji++], start + k * d));
        }
        res.push({ type: 'stair', step: d, n, start, end: start + (n - 1) * d, suit: sameSuit ? nat[0].s : '*', cards, view });
      }
    }
  }
  return res;
}

function strength(g, it) {
  const rev = effRev(g);
  if (it.type === 'set') {
    if (it.rank === 16) return g.arthur ? (rev ? 7.5 : 10.5) : 100;
    if (it.rank === 7) {
      const nat = it.cards.filter((c) => !isJ(c));
      if (g.rules.red7 && nat.every(isRed)) return 15.5;
      if (g.rules.black7 && rev && nat.every((c) => !isRed(c))) return 15.5;
    }
    return rev ? 18 - it.rank : it.rank;
  }
  return rev ? 18 - it.end : it.start;
}
function suitsOf(it) {
  return [...new Set(it.cards.filter((c) => !isJ(c)).map((c) => c.s))].sort();
}
const sameArr = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const covers = (it, r) => it.type === 'stair' && it.step === 1 && it.start <= r && it.end >= r;
const isSetRank = (it, r, n) => it.type === 'set' && it.rank === r && (n == null || it.n === n);

function lockOK(g, it) {
  if (!g.lock) return true;
  const ok = g.lockAny
    ? it.cards.some((c) => isJ(c) || g.lock.includes(c.s))
    : it.cards.every((c) => isJ(c) || g.lock.includes(c.s));
  if (!ok) return false;
  if (g.lockSeq && g.field && strength(g, it) !== strength(g, g.field.it) + 1) return false;
  return true;
}

function canPlay(g, it) {
  const R = g.rules, f = g.field;
  if (!f) return true;
  const fi = f.it;
  if (f.cut8) {
    if (R.stop4 && isSetRank(it, 4, 2)) return true;
    if (R.d7 && it.type === 'set' && it.n === 1 && it.cards[0].s === 'D' && it.cards[0].r === 7) return true;
    return false;
  }
  if (R.sunaarashi && !g.omen && isSetRank(it, 3, 3)) return true;
  if (fi.type === 'set' && fi.rank === 16 && fi.n === 1 && !g.arthur) {
    if (R.spade3 && it.type === 'set' && it.n === 1 && it.cards[0].s === 'S' && it.cards[0].r === 3) return true;
    if (R.sanSan && isSetRank(it, 3, 3)) return true;
  }
  if (R.guerrilla && fi.type === 'set' && it.type === 'set' && it.rank === fi.rank && it.rank !== 16 && it.n > fi.n && lockOK(g, it)) return true;
  if (it.type !== fi.type || it.n !== fi.n) return false;
  if (it.type === 'stair' && it.step !== fi.step) return false;
  if (!lockOK(g, it)) return false;
  const a = strength(g, it), b = strength(g, fi);
  if (a > b) return true;
  if (a === b && R.followRev && !g.noRev && it.type === 'set' && it.n >= 2 && it.rank !== 16 && it.rank === fi.rank) return true;
  return false;
}

// ---- 候補生成（AIと「出せる手」表示用） ---------------------------------
function combos(arr, k) {
  const out = [];
  (function rec(i, cur) {
    if (cur.length === k) { out.push(cur.slice()); return; }
    for (let j = i; j < arr.length; j++) { cur.push(arr[j]); rec(j + 1, cur); cur.pop(); }
  })(0, []);
  return out;
}
function candidates(hand, R) {
  const jokers = hand.filter(isJ);
  const nat = hand.filter((c) => !isJ(c));
  const out = [];
  const byRank = {};
  nat.forEach((c) => (byRank[c.r] = byRank[c.r] || []).push(c));
  for (const r of Object.keys(byRank)) {
    const arr = byRank[r];
    for (let k = 1; k <= arr.length; k++) {
      for (const cs of combos(arr, k)) {
        for (let j = 0; j <= jokers.length; j++) out.push(cs.concat(jokers.slice(0, j)));
      }
    }
  }
  for (let j = 1; j <= jokers.length; j++) out.push(jokers.slice(0, j));
  const steps = [];
  if (R.stairs) steps.push(1);
  if (R.tobi) for (let d = 2; d <= 6; d++) steps.push(d);
  for (const s of SUITS) {
    const m = {};
    nat.filter((c) => c.s === s).forEach((c) => (m[c.r] = c));
    for (const d of steps) {
      for (let st = 3; st <= 15; st++) {
        for (let n = 3; st + (n - 1) * d <= 15; n++) {
          const cs = [];
          let miss = 0;
          for (let k = 0; k < n; k++) { const c = m[st + k * d]; if (c) cs.push(c); else miss++; }
          if (cs.length >= 1 && miss <= jokers.length) out.push(cs.concat(jokers.slice(0, miss)));
        }
      }
    }
  }
  if (R.emperor) {
    for (let st = 3; st <= 12; st++) {
      (function rec(k, cur, used, miss) {
        if (miss > jokers.length) return;
        if (k === 4) { if (cur.length >= 1) out.push(cur.concat(jokers.slice(0, miss))); return; }
        for (const c of nat.filter((x) => x.r === st + k)) if (!used.has(c.s)) rec(k + 1, cur.concat([c]), new Set([...used, c.s]), miss);
        rec(k + 1, cur, used, miss + 1);
      })(0, [], new Set(), 0);
    }
  }
  const seen = new Set();
  return out.filter((cs) => {
    const k = cs.map((c) => c.id).sort((a, b) => a - b).join(',');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
function legalPlays(g, seat) {
  const res = [];
  for (const cs of candidates(g.hands[seat], g.rules)) {
    let its = interpretations(cs, g.rules).filter((it) => canPlay(g, it));
    if (g.mustD3) its = its.filter((it) => it.cards.some(isD3));
    if (its.length) {
      its.sort((a, b) => strength(g, a) - strength(g, b));
      res.push(its[0]);
    }
  }
  return res;
}
function legalKeys(g, seat) {
  return legalPlays(g, seat).map((it) => it.cards.map((c) => c.id).sort((a, b) => a - b));
}

// ---- 手札操作 -----------------------------------------------------------
function takeCards(g, seat, k, strongest) {
  const h = g.hands[seat].slice().sort((a, b) => (strongest ? cardPower(g, b) - cardPower(g, a) : cardPower(g, a) - cardPower(g, b)));
  const moved = h.slice(0, Math.min(k, h.length));
  g.hands[seat] = g.hands[seat].filter((c) => !moved.includes(c));
  return moved;
}
function drawDiscard(g, k, strongest) {
  const pool = g.discard.filter((c) => !g.justPlayed || !g.justPlayed.has(c.id)); // 今出した札は引けない
  const d = strongest ? pool.sort((a, b) => cardPower(g, b) - cardPower(g, a)) : shuffle(pool);
  const got = d.slice(0, Math.min(k, d.length));
  g.discard = g.discard.filter((c) => !got.includes(c));
  return got;
}

// ---- ラウンド進行 -------------------------------------------------------
function newRound(prevPlaces, n, rules, ctx) {
  n = n || 4;
  const R = normRules(rules);
  const deck = shuffle(makeDeck());
  const hands = Array.from({ length: n }, () => []);
  deck.forEach((c, i) => hands[i % n].push(c));
  const g = {
    n, hands, rules: R, order: Array.from({ length: n }, (_, i) => i), dir: 1,
    turn: 0, field: null, lock: null, lockAny: false, lockSeq: false,
    rev: false, jb: false, jbNext: false, noRev: false, omen: false, arthur: false, revLock: false,
    passes: 0, passedFlags: Array(n).fill(false), lastPlayer: -1, lastAce: null,
    places: [], fouls: [], phase: 'play', exchange: null, log: [], events: [], evSeq: 0,
    leaderSeat: 0, discard: [], removed: [], trick: [], passTotal: 0,
    mustD3: false, restSeat: null, restDone: true, prev: null, maintained: false,
  };
  const prev = prevPlaces && prevPlaces.length === n ? prevPlaces.slice() : null;
  g.prev = prev;

  if (R.monopoly) {
    for (let s = 0; s < n; s++) {
      for (const su of SUITS) {
        if (hands[s].filter((c) => c.s === su).length === 13) {
          pushLog(g, s, 'モノポリー！ ' + SYM[su] + 'を全部そろえた');
          ev(g, 'win', 'モノポリー！', s);
          instantWin(g, s);
          return g;
        }
      }
    }
  }
  if (prev) {
    const extra = R.defense && ctx && ctx.maintained ? 1 : 0;
    g.exchange = { needs: [], log: [] };
    const take = (from, to, k) => {
      const moved = takeCards(g, from, k, true);
      g.hands[to].push(...moved);
      g.exchange.needs.push({ seat: to, n: moved.length, to: from, received: moved.map((c) => c.id) });
      g.exchange.log.push({ from, to, n: moved.length });
    };
    const rich = prev[0], poor = prev[n - 1];
    const pairs = [[poor, rich, 2 + extra]];
    if (n >= 4) pairs.push([prev[n - 2], prev[1], 1 + extra]);
    let list = pairs;
    if (R.zettai) {
      list = n >= 4 ? [[prev[1], rich, 1], [prev[n - 2], rich, 2], [poor, rich, 3]] : [[prev[1], rich, 1], [poor, rich, 3]];
      list = list.map((x) => [x[0], x[1], x[2] + extra]);
    }
    const swapped = new Set();
    if (R.tenpen) {
      for (const [lo, hi] of pairs) {
        if (g.hands[lo].every((c) => !isJ(c) && c.r >= 3 && c.r <= 10)) {
          const t = g.hands[lo]; g.hands[lo] = g.hands[hi]; g.hands[hi] = t;
          swapped.add(lo);
          pushLog(g, lo, '天変地異！ 手札をまるごと交換');
          ev(g, 'special', '天変地異！', lo);
        }
      }
    }
    for (const [from, to, k] of list) if (!swapped.has(from)) take(from, to, k);
    g.leaderSeat = R.daihinMeguri ? poor : rich;
    if (R.richRest) { g.restSeat = rich; g.restDone = false; }
    if (g.exchange.needs.length) {
      g.phase = 'exchange';
      g.turn = g.leaderSeat;
    } else {
      g.exchange = null;
      setTurn(g, g.leaderSeat);
    }
  } else {
    g.turn = g.hands.findIndex((h) => h.some(isD3));
    g.leaderSeat = g.turn;
    if (R.d3start) g.mustD3 = true;
  }
  return g;
}

function giveBack(g, seat, ids) {
  if (g.phase !== 'exchange') return err('交換フェーズではありません');
  const need = g.exchange.needs.find((n) => n.seat === seat);
  if (!need) return err('あなたの交換は完了しています');
  if (!Array.isArray(ids) || new Set(ids).size !== need.n) return err(`${need.n}枚選んでください`);
  const cards = ids.map((id) => g.hands[seat].find((c) => c.id === id));
  if (cards.some((c) => !c)) return err('不正なカードです');
  g.hands[seat] = g.hands[seat].filter((c) => !cards.includes(c));
  g.hands[need.to].push(...cards);
  g.exchange.needs = g.exchange.needs.filter((n) => n !== need);
  if (g.exchange.needs.length === 0) { g.phase = 'play'; setTurn(g, g.leaderSeat); }
  return { ok: true };
}
function autoGive(g, seat) {
  const need = g.exchange && g.exchange.needs.find((n) => n.seat === seat);
  if (!need) return;
  const ids = g.hands[seat].slice().sort((a, b) => a.r - b.r).slice(0, need.n).map((c) => c.id);
  giveBack(g, seat, ids);
}

function itText(it) {
  return it.view
    .map((c) => (isJ(c) ? 'JK' + (c.as ? '(' + LABEL[c.as] + ')' : '') : SYM[c.s] + LABEL[c.r]))
    .join(' ');
}
function clearField(g) {
  g.field = null;
  g.lock = null;
  g.lockAny = false;
  g.lockSeq = false;
  g.passes = 0;
  g.passedFlags = Array(g.n).fill(false);
  g.trick = [];
  if (g.jbNext) g.jbNext = false; else g.jb = false;
}
function setTurn(g, seat) {
  if (g.restSeat != null && !g.restDone && seat === g.restSeat && g.hands[seat].length > 0) {
    g.restDone = true;
    pushLog(g, seat, '大富豪の余裕で最初の1巡は休み');
    if (g.field) { g.passedFlags[seat] = true; g.passes++; }
    const nx = nextActive(g, seat);
    if (g.field && flushIfAllPassed(g)) return;
    g.turn = nx;
    return;
  }
  g.turn = seat;
}
function instantWin(g, seat) {
  const rest = g.order.filter((s) => s !== seat).sort((a, b) => g.hands[a].length - g.hands[b].length);
  g.places = [seat].concat(rest);
  g.fouls = [];
  g.phase = 'end';
  applyEndRules(g);
}
function applyEndRules(g) {
  const R = g.rules, p = g.prev, n = g.n;
  g.maintained = !!(p && g.places[0] === p[0]);
  if (!p) return;
  if (R.gekokujo && g.places[0] === p[n - 1] && p[n - 1] !== p[0]) {
    g.places = p.slice().reverse();
    pushLog(g, g.places[0], '下克上！ 全員の順位が逆転');
    ev(g, 'special', '下克上！', g.places[0]);
    return;
  }
  if (R.miyako && g.places[0] !== p[0]) {
    g.places = g.places.filter((s) => s !== p[0]).concat([p[0]]);
    pushLog(g, p[0], '都落ち！ 大貧民に転落');
    ev(g, 'special', '都落ち！', p[0]);
  }
}
function finish(g) {
  for (const s of activeSeats(g)) if (!g.places.includes(s) && !g.fouls.includes(s)) g.places.push(s);
  g.places = g.places.concat(g.fouls.slice().reverse());
  g.phase = 'end';
  applyEndRules(g);
}
function checkEnd(g) {
  if (g.phase === 'end') return true;
  if (activeSeats(g).length <= 1) { finish(g); return true; }
  return false;
}
function foulCheck(g, it) {
  const R = g.rules;
  const cs = it.cards;
  return (R.foul2 && cs.some((c) => c.r === 15)) || (R.foul8 && cs.some((c) => c.r === 8)) || (R.foul11 && cs.some((c) => c.r === 11)) ||
    (R.foulJoker && cs.some(isJ)) || (R.foulS3 && cs.some((c) => c.s === 'S' && c.r === 3));
}
function settleOuts(g, lastSeat, it) {
  const done = new Set([...g.places, ...g.fouls]);
  const order = [lastSeat].concat(g.order.filter((s) => s !== lastSeat));
  for (const s of order) {
    if (g.hands[s].length === 0 && !done.has(s)) {
      done.add(s);
      if (it && s === lastSeat && foulCheck(g, it)) {
        g.fouls.push(s);
        pushLog(g, s, '反則上がり！ 最下位へ');
        ev(g, 'foul', '反則上がり…', s);
      } else {
        g.places.push(s);
        pushLog(g, s, '上がり！');
        ev(g, 'out', '上がり！', s);
      }
    }
  }
}
function flushIfAllPassed(g) {
  if (!g.field) return false;
  const others = g.order.filter((i) => g.hands[i].length > 0 && i !== g.lastPlayer);
  if (g.passes < others.length) return false;
  const lastOut = g.hands[g.lastPlayer].length === 0;
  if (g.field.lucky && !lastOut) {
    pushLog(g, g.lastPlayer, 'ラッキーセブン成功！ 大富豪に');
    ev(g, 'win', 'ラッキーセブン！', g.lastPlayer);
    instantWin(g, g.lastPlayer);
    return true;
  }
  let leader = lastOut ? nextActive(g, g.lastPlayer) : g.lastPlayer;
  if (g.rules.nextAce && g.lastAce != null && g.hands[g.lastAce].length > 0) leader = g.lastAce;
  g.lastAce = null;
  clearField(g);
  pushLog(g, -1, '場が流れました');
  g.turn = leader;
  return true;
}

// ---- 革命・縛り ---------------------------------------------------------
function revTrigger(g, it, prevF) {
  const R = g.rules;
  if (g.noRev) return false;
  const jokerOK = !it.cards.some(isJ) || R.jokerRev;
  if (R.revolution && it.type === 'set' && it.n >= 4 && jokerOK) return true;
  if (it.type === 'stair' && jokerOK) {
    if (it.step === 1 && ((R.stairRev && it.n >= 5) || (R.stairRev3 && it.n >= 3))) return true;
    if (it.step >= 2 && R.tobiRev && it.n >= 4) return true;
  }
  if (R.coup && isSetRank(it, 9, 3)) return true;
  if (R.omen && isSetRank(it, 6, 3)) return true;
  if (R.followRev && prevF && !prevF.cut8 && prevF.it.type === 'set' && prevF.it.n >= 2 && it.type === 'set' && it.n === prevF.it.n && it.rank === prevF.it.rank && it.rank !== 16) return true;
  return false;
}
function applyLock(g, it, prevF) {
  const R = g.rules;
  if (!R.lock || g.omen || !prevF || prevF.cut8 || g.lock) return;
  if (it.type === 'stair' && it.step >= 2 && !R.tobiShiba) return;
  const ps = suitsOf(it), fs = suitsOf(prevF.it);
  let locked = false;
  if (ps.length && sameArr(ps, fs)) {
    g.lock = ps; g.lockAny = false; locked = true;
  } else if (R.katashiba && it.n >= 2 && prevF.it.n >= 2) {
    const inter = ps.filter((s) => fs.includes(s));
    if (inter.length) { g.lock = inter; g.lockAny = true; locked = true; }
  }
  if (locked) {
    const consecutive = strength(g, it) === strength(g, prevF.it) + 1;
    if (consecutive && ((it.n === 1 && R.gekishiba) || (it.n >= 2 && R.ryogeki))) g.lockSeq = true;
    pushLog(g, -1, '縛り！ ' + g.lock.map((s) => SYM[s]).join('') + (g.lockSeq ? '（続き番号）' : ''));
    ev(g, 'lock', g.lockSeq ? '激シバ！' : '縛り！', g.lastPlayer);
  }
}
function cutsField(g, it) {
  const R = g.rules;
  if (g.omen) return false;
  const ranks = [];
  if (g.rev && (R.cutRev6 || R.cutRev7)) { if (R.cutRev6) ranks.push(6); if (R.cutRev7) ranks.push(7); }
  else if (R.eight) ranks.push(8);
  if (R.cut4) ranks.push(4);
  if (it.type === 'set' && ranks.includes(it.rank)) return true;
  if (it.type === 'stair' && it.step === 1 && ranks.some((r) => covers(it, r))) return true;
  if (R.dignity && it.type === 'stair' && it.step === 1 && it.start <= 11 && it.end >= 13) return true;
  return false;
}
function counterPossible(g, seat) {
  const R = g.rules;
  for (const s of activeSeats(g)) {
    if (s === seat) continue;
    const h = g.hands[s];
    if (R.stop4) {
      const fours = h.filter((c) => c.r === 4).length, jk = h.filter(isJ).length;
      if (fours + jk >= 2 && (fours >= 1 || jk >= 2)) return true;
    }
    if (R.d7 && h.some((c) => c.s === 'D' && c.r === 7)) return true;
  }
  return false;
}

// ---- カード効果 ---------------------------------------------------------
function applyEffects(g, seat, it, prevF, opts) {
  const R = g.rules;
  const special = !g.omen;
  const nat = it.cards.filter((c) => !isJ(c));
  const others = () => activeSeats(g).filter((s) => s !== seat);
  const name = (s) => 'P' + (s + 1);
  let omenNow = false;

  // 革命
  if (revTrigger(g, it, prevF) && !(opts.noRev && R.revChoice)) {
    if (!g.rev || (R.revBack && !g.revLock)) {
      g.rev = !g.rev;
      pushLog(g, -1, g.rev ? '革命！ 強さが逆転' : '革命返し！ 強さが元に戻る');
      ev(g, g.rev ? 'revolution' : 'revBack', g.rev ? '革命！' : '革命返し！', seat);
      if (R.revNagashi && isSetRank(it, 8)) g.revLock = true;
      if (R.superRev && it.cards.length >= 5) g.noRev = true;
    }
    if (R.omen && isSetRank(it, 6, 3)) omenNow = true;
  }
  if (special) {
    // バック系
    if (R.jBack && (isSetRank(it, 11) || covers(it, 11))) {
      g.jb = !g.jb;
      pushLog(g, -1, '11バック！ この場だけ強さが逆転');
      ev(g, 'jback', '11バック！', seat);
      if (R.jBack3 && isSetRank(it, 11, 3)) g.jbNext = true;
    }
    if (R.back2 && (isSetRank(it, 15) || covers(it, 15))) {
      g.jb = !g.jb;
      pushLog(g, -1, '2バック！');
      ev(g, 'jback', '2バック！', seat);
    }
    if (R.back6 && g.jb && (isSetRank(it, 6) || covers(it, 6))) {
      g.jb = false;
      pushLog(g, -1, '6戻し！');
      ev(g, 'special', '6戻し！', seat);
    }
    if (it.type === 'set' && it.rank !== 16) {
      const r = it.rank, k = it.n;
      if (R.nextAce && r === 14) g.lastAce = seat;
      if (R.daikaku && r === 15 && k === 4) {
        pushLog(g, seat, '大革命！ 2を4枚で勝利');
        ev(g, 'win', '大革命！', seat);
        instantWin(g, seat);
        return;
      }
      if (R.lucky7 && r === 7 && k === 3) g.field.lucky = true;
      if (R.yamiichi && r === 14 && k === 3) {
        const cand = others().filter((s) => g.hands[s].length >= 2);
        if (cand.length) {
          const t = cand[Math.floor(Math.random() * cand.length)];
          const give = takeCards(g, seat, 2, false);
          const get = takeCards(g, t, 2, true);
          g.hands[t].push(...give);
          g.hands[seat].push(...get);
          pushLog(g, seat, '闇市！ ' + name(t) + 'と強い札を交換');
          ev(g, 'special', '闇市！', seat);
        }
      }
      if (R.zombie && r === 3 && k === 3 && g.discard.length) {
        const c = drawDiscard(g, 1, false)[0];
        const t = nextActive(g, seat);
        if (c && t !== seat) { g.hands[t].push(c); pushLog(g, seat, 'ゾンビ！ ' + name(t) + 'に札を押し付け'); ev(g, 'special', 'ゾンビ！', seat); }
        else if (c) g.discard.push(c);
      }
      if (R.death && r === 4 && k === 3) {
        for (const s of others()) g.discard.push(...takeCards(g, s, 1, true));
        pushLog(g, seat, 'DEATH！ 全員が最強の札を捨てる');
        ev(g, 'death', 'DEATH！', seat);
      }
      if (R.color5 && r === 5 && nat.length) {
        g.lock = [...new Set(nat.map((c) => c.s))].sort(); g.lockAny = false; g.lockSeq = false;
        pushLog(g, -1, '5番目の色！ ' + g.lock.map((s) => SYM[s]).join('') + 'のみ');
        ev(g, 'lock', '5番目の色！', seat);
      }
      if (R.red5 && r === 5 && nat.some(isRed)) {
        const c = others();
        if (c.length) {
          const t = c[Math.floor(Math.random() * c.length)];
          const pool = shuffle(g.hands[seat].concat(g.hands[t]));
          const mine = Math.floor(pool.length / 2);
          g.hands[seat] = pool.slice(0, mine);
          g.hands[t] = pool.slice(mine);
          pushLog(g, seat, '赤い5！ ' + name(t) + 'と手札を分け直し');
          ev(g, 'special', '赤い5！', seat);
        }
      }
      if (R.satan && r === 6 && k === 3) {
        const got = drawDiscard(g, 1, true);
        g.hands[seat].push(...got);
        if (got.length) { pushLog(g, seat, 'サタン！ 捨て札から最強札を回収'); ev(g, 'special', 'サタン！', seat); }
      }
      if (R.pass7 && r === 7) {
        const t = nextActive(g, seat);
        if (t !== seat) {
          const moved = takeCards(g, seat, k, false);
          g.hands[t].push(...moved);
          if (moved.length) { pushLog(g, seat, '7渡し！ ' + moved.length + '枚を' + name(t) + 'へ'); ev(g, 'special', '7渡し！', seat); }
        }
      }
      if (R.black7draw && r === 7 && nat.some((c) => !isRed(c))) {
        const got = drawDiscard(g, k, false);
        g.hands[seat].push(...got);
        if (got.length) { pushLog(g, seat, '黒い7！ 捨て札から' + got.length + '枚'); ev(g, 'special', '黒い7！', seat); }
      }
      if (R.reverse9 && r === 9) { g.dir *= -1; pushLog(g, -1, '9リバース！ 逆回り'); ev(g, 'reverse', 'リバース！', seat); }
      if (R.shuffle9 && r === 9 && k === 2) { g.order = shuffle(g.order.slice()); pushLog(g, -1, '9シャッフル！ 席順が入れ替わった'); ev(g, 'special', '席順シャッフル！', seat); }
      if (R.galaxy && r === 9 && k === 3) {
        const got = drawDiscard(g, 2, false);
        g.hands[seat].push(...got);
        const back = takeCards(g, seat, got.length, false);
        g.discard.push(...back);
        pushLog(g, seat, '銀河鉄道！ 捨て札と手札を入れ替え');
        ev(g, 'special', '銀河鉄道！', seat);
      }
      if (R.discard10 && r === 10) {
        const d = takeCards(g, seat, k, false);
        g.discard.push(...d);
        if (d.length) { pushLog(g, seat, '10捨て！ ' + d.length + '枚を捨てた'); ev(g, 'special', '10捨て！', seat); }
      }
      if (R.reverseQ && r === 12) { g.dir *= -1; pushLog(g, -1, 'Qリバース！ 逆回り'); ev(g, 'reverse', 'リバース！', seat); }
      if (R.loveQ && r === 12) {
        const got = drawDiscard(g, 1, false);
        g.hands[seat].push(...got);
        if (got.length) { pushLog(g, seat, 'Qラブ！ 捨て札を1枚獲得'); ev(g, 'special', 'Qラブ！', seat); }
      }
      if (R.bloody && r === 12 && k === 3) {
        for (const s of others()) g.discard.push(...takeCards(g, s, 2, true));
        pushLog(g, seat, 'ブラッディメアリ！ 全員が最強2枚を捨てる');
        ev(g, 'death', 'ブラッディメアリ！', seat);
      }
      if (R.jeanne && r === 12 && k === 3) {
        const t = nextActive(g, seat);
        if (t !== seat) { g.discard.push(...takeCards(g, t, 2, true)); pushLog(g, seat, 'ジャンヌ・ダルク！ ' + name(t) + 'が最強2枚を捨てる'); ev(g, 'death', 'ジャンヌ・ダルク！', seat); }
      }
      if (R.reverseK && r === 13) { g.dir *= -1; pushLog(g, -1, 'Kリバース！ 逆回り'); ev(g, 'reverse', 'リバース！', seat); }
      if (R.nero && r === 13 && k === 3) {
        let best = null, from = -1;
        for (const s of others()) for (const c of g.hands[s]) if (!best || cardPower(g, c) > cardPower(g, best)) { best = c; from = s; }
        if (best) {
          g.hands[from] = g.hands[from].filter((c) => c !== best);
          g.hands[seat].push(best);
          pushLog(g, seat, 'ネロ！ ' + name(from) + 'から最強札を徴収');
          ev(g, 'special', 'ネロ！', seat);
        }
      }
      if (R.arthur && r === 13 && k === 3) {
        g.arthur = true;
        pushLog(g, -1, 'アーサー！ ジョーカーが弱体化');
        ev(g, 'special', 'アーサー！', seat);
      }
      if (R.mlk && r === 13) {
        const act = activeSeats(g);
        const given = new Map();
        for (const s of act) given.set(s, takeCards(g, s, 1, false));
        for (const s of act) g.hands[nextActive(g, s)].push(...given.get(s));
        pushLog(g, seat, 'キング牧師！ 全員が隣に1枚渡す');
        ev(g, 'special', 'キング牧師！', seat);
      }
    }
  }
  if (omenNow) {
    g.omen = true; g.noRev = true;
    pushLog(g, -1, 'オーメン！ 以降は革命・特殊札・縛りが無効');
    ev(g, 'special', 'オーメン！', seat);
  }
}

function doPlay(g, seat, ids, opts) {
  opts = opts || {};
  if (g.phase !== 'play') return err('今はカードを出せません');
  if (g.turn !== seat) return err('あなたの番ではありません');
  if (!Array.isArray(ids) || !ids.length) return err('カードを選んでください');
  const R = g.rules;
  const cards = [];
  const seen = new Set();
  for (const id of ids) {
    const c = g.hands[seat].find((x) => x.id === id);
    if (!c || seen.has(id)) return err('不正なカードです');
    seen.add(id);
    cards.push(c);
  }
  const its = interpretations(cards, R);
  if (!its.length) return err('その組み合わせは出せません');
  let ok = its.filter((it) => canPlay(g, it));
  if (!ok.length) return err('そのカードは場に出せません（枚数・強さ・縛りを確認）');
  if (g.mustD3) {
    ok = ok.filter((it) => it.cards.some(isD3));
    if (!ok.length) return err('最初の手はダイヤの3を含めてください');
  }
  ok.sort((a, b) => strength(g, a) - strength(g, b));
  const it = ok[0];
  const prevF = g.field;
  g.mustD3 = false;
  g.hands[seat] = g.hands[seat].filter((c) => !seen.has(c.id));
  g.discard.push(...cards);
  g.trick.push(...cards);
  g.justPlayed = new Set(cards.map((c) => c.id));
  g.lastPlayer = seat;
  applyLock(g, it, prevF);
  g.field = { it, player: seat };
  g.passes = 0;
  g.passedFlags = Array(g.n).fill(false);
  pushLog(g, seat, itText(it));

  applyEffects(g, seat, it, prevF, opts);
  if (g.phase === 'end') return { ok: true };
  settleOuts(g, seat, it);
  if (checkEnd(g)) return { ok: true };
  const out = g.hands[seat].length === 0;

  if (cutsField(g, it)) {
    const label = isSetRank(it, 4) ? '4切り！' : (it.type === 'stair' && R.dignity && it.start <= 11 && it.end >= 13 ? '威厳！' : (isSetRank(it, 8) || covers(it, 8) ? '8切り！' : (isSetRank(it, 7) ? '7切り！' : '切り！')));
    ev(g, 'cut', label, seat);
    if (isSetRank(it, 8, 1) && (R.stop4 || R.d7) && counterPossible(g, seat) && !out) {
      g.field.cut8 = true;
      pushLog(g, -1, label + ' 対抗できる人は出してください');
      g.turn = nextActive(g, seat);
      return { ok: true };
    }
    if (R.eight3 && isSetRank(it, 8) && it.n >= 3) {
      const ids2 = new Set(g.trick.map((c) => c.id));
      const gone = g.discard.filter((c) => ids2.has(c.id)); // 手札に戻った札は消さない
      g.removed.push(...gone);
      g.discard = g.discard.filter((c) => !ids2.has(c.id));
      pushLog(g, -1, '強化8切り！ この場のカードは消滅');
    }
    pushLog(g, -1, label + ' 場が流れる');
    clearField(g);
    g.lastAce = null;
    g.turn = out ? nextActive(g, seat) : seat;
    return { ok: true };
  }

  let next = nextActive(g, seat);
  if (it.type === 'set' && !g.omen && it.rank !== 16 && ((R.skip5 && it.rank === 5) || (R.skipK && it.rank === 13))) {
    let skipped = 0;
    for (let t = 0; t < it.n; t++) {
      if (next === seat) break;
      g.passedFlags[next] = true;
      g.passes++;
      skipped++;
      pushLog(g, next, 'スキップ！');
      next = nextActive(g, next);
    }
    if (skipped) ev(g, 'skip', 'スキップ！', seat);
    if (flushIfAllPassed(g)) return { ok: true };
  }
  setTurn(g, next);
  return { ok: true };
}

function doPass(g, seat) {
  if (g.phase !== 'play') return err('今はパスできません');
  if (g.turn !== seat) return err('あなたの番ではありません');
  if (!g.field) return err('最初の手番はパスできません');
  g.passes++;
  g.passedFlags[seat] = true;
  g.passTotal++;
  pushLog(g, seat, 'パス');
  if (g.rules.guillotine && g.passTotal === GUILLOTINE_N) {
    g.discard.push(...g.hands[seat]);
    g.hands[seat] = [];
    g.fouls.push(seat);
    pushLog(g, seat, 'ギロチン！ 強制的に大貧民へ');
    ev(g, 'foul', 'ギロチン！', seat);
    if (checkEnd(g)) return { ok: true };
  }
  if (flushIfAllPassed(g)) return { ok: true };
  setTurn(g, nextActive(g, seat));
  return { ok: true };
}

// ---- AI -----------------------------------------------------------------
function handAvg(g, cards, rev) {
  if (!cards.length) return 0;
  let t = 0;
  for (const c of cards) t += isJ(c) ? 20 : rev ? 18 - c.r : c.r;
  return t / cards.length;
}
function costOf(g, seat, it, leading, level) {
  const ids = new Set(it.cards.map((c) => c.id));
  const remaining = g.hands[seat].filter((c) => !ids.has(c.id));
  if (remaining.length === 0) return foulCheck(g, it) ? 50 : -1000;
  const s = strength(g, it);
  let cost = s >= 100 ? 30 : s;
  cost += it.cards.filter(isJ).length * 5;
  cost -= it.n * 1.2;
  if (cutsField(g, it) && !leading) cost -= 2;
  if (revTrigger(g, it, g.field)) {
    const now = handAvg(g, remaining, effRev(g));
    const flipped = handAvg(g, remaining, !effRev(g));
    cost += flipped > now + 0.8 ? -8 : 8;
  }
  if (!leading && !g.lock && g.field) {
    const ps = suitsOf(it);
    if (ps.length && sameArr(ps, suitsOf(g.field.it))) cost -= 0.8;
  }
  if (level === 'normal') cost += Math.random() * 1.5;
  return cost;
}
function aiChoose(g, seat, level) {
  const leading = !g.field;
  const legal = legalPlays(g, seat);
  if (!legal.length) return { type: 'pass' };
  const hand = g.hands[seat];
  const oppMin = Math.min(...g.hands.map((h, i) => (i === seat || h.length === 0 ? 99 : h.length)));
  const scored = legal.map((it) => ({ it, cost: costOf(g, seat, it, leading, level) })).sort((a, b) => a.cost - b.cost);
  const play = (x) => ({ type: 'play', ids: x.it.cards.map((c) => c.id) });
  if (g.field && g.field.cut8) return Math.random() < 0.7 ? play(scored[0]) : { type: 'pass' };
  if (level === 'easy') {
    if (!leading && Math.random() < 0.2) return { type: 'pass' };
    const top = scored.slice(0, Math.min(4, scored.length));
    return play(top[Math.floor(Math.random() * top.length)]);
  }
  const best = scored[0];
  if (!leading && best.cost > -500) {
    const s = strength(g, best.it);
    const saveLimit = level === 'hard' ? 13 : 15;
    const oppLimit = level === 'hard' ? 3 : 5;
    if (s >= saveLimit && oppMin > oppLimit && hand.length > best.it.n + 2) return { type: 'pass' };
  }
  return play(best);
}

module.exports = {
  SUITS, SYM, LABEL, RULES: RULE_LIST, DEFAULT_RULES, UNSUPPORTED, normRules, makeDeck, shuffle, sortHand, cardView,
  interpretations, strength, canPlay, legalKeys, legalPlays, newRound, giveBack, autoGive, doPlay, doPass, aiChoose, nextActive, effRev,
};

return module.exports;
})();

const INDEX_HTML = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>大富豪オンライン</title>
<style>
:root{--bg:#0f3b2c;--bg2:#0a2a1f;--card:#fffdf6;--ink:#1d1d1f;--red:#c62828;--gold:#f4c542;--cw:clamp(58px,10.5vw,96px);--ch:calc(var(--cw)*1.45)}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;height:100%;background:var(--bg2);color:#fff;font-family:"Hiragino Sans","Yu Gothic",Meiryo,system-ui,sans-serif}
button{font:inherit;cursor:pointer;border:0;border-radius:10px;padding:10px 16px;font-weight:700;background:var(--gold);color:#3a2a00}
button.sub{background:#ffffff22;color:#fff}
button:disabled{opacity:.35;cursor:not-allowed}
input,select{font:inherit;padding:10px 12px;border-radius:10px;border:1px solid #ffffff44;background:#00000040;color:#fff;min-width:0}
select option{color:#000}
.screen{display:none;min-height:100%;padding:16px;max-width:820px;margin:0 auto}
.screen.on{display:block}
h1{font-size:28px;margin:24px 0 4px;text-align:center}
.sub-title{text-align:center;opacity:.7;margin-bottom:20px}
.panel{background:#ffffff12;border:1px solid #ffffff20;border-radius:16px;padding:16px;margin:12px 0}
.panel h2{margin:0 0 10px;font-size:16px}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.row>input{flex:1}
.code{font-size:40px;letter-spacing:8px;font-weight:800;text-align:center;color:var(--gold)}
.seat{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-radius:10px;background:#00000030;margin:6px 0}
.seat .tag{font-size:12px;opacity:.7}
#toast{position:fixed;left:50%;top:14px;transform:translateX(-50%);background:#000c;padding:10px 16px;border-radius:12px;z-index:60;display:none;max-width:90%}
/* ルール選択 */
.rp-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px;font-size:13px}
.rp-bar select{padding:6px 8px}
.rp-bar button{padding:6px 10px;font-size:13px}
details.rg{background:#00000030;border-radius:12px;margin:6px 0}
details.rg>summary{cursor:pointer;padding:10px 12px;font-weight:700;list-style:none;display:flex;justify-content:space-between}
details.rg>summary::-webkit-details-marker{display:none}
details.rg>summary .cnt{font-weight:400;opacity:.7;font-size:12px}
.rl{display:grid;gap:4px;padding:0 8px 8px}
.rl label{display:flex;gap:10px;align-items:flex-start;padding:8px 10px;border-radius:10px;background:#ffffff0d;font-size:13px;line-height:1.45}
.rl label.on{background:#f4c54233;outline:1px solid #f4c54288}
.rl input{margin-top:3px;flex:none;width:18px;height:18px;padding:0}
.rl .nm{font-weight:700}
.rl .st{color:var(--gold);font-size:11px;margin-left:6px;letter-spacing:1px}
.rl small{display:block;opacity:.75}
.chiprow{display:flex;gap:6px;flex-wrap:wrap}
.chip{background:#ffffff1f;border-radius:99px;padding:3px 10px;font-size:12px}
.chip.hot{background:var(--gold);color:#3a2a00;font-weight:800}
.chip.red{background:#e53935;color:#fff;font-weight:800}
/* ゲーム */
#game{padding:0;max-width:none;height:100vh;height:100dvh;overflow:hidden;background:radial-gradient(ellipse at center,var(--bg) 0%,var(--bg2) 100%)}
#game.on{display:flex;flex-direction:column}
.top{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;font-size:13px;gap:8px;flex-wrap:wrap}
.opps{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;padding:0 8px}
.opp{flex:1 1 110px;max-width:170px;background:#00000030;border-radius:14px;padding:7px 6px;text-align:center;border:2px solid transparent;position:relative;min-width:0}
.opp.turn{border-color:var(--gold);box-shadow:0 0 14px #f4c54299}
.opp .nm{font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.opp .ttl{font-size:11px;color:var(--gold);min-height:15px}
.opp .cnt{font-size:26px;font-weight:800;line-height:1.1}
.opp .cnt small{font-size:11px;font-weight:400}
.opp .pass{position:absolute;right:4px;top:4px;background:#fff;color:#333;border-radius:8px;padding:1px 6px;font-size:11px}
.opp .off{opacity:.5}
.opp .pt{font-size:11px;opacity:.7}
.center{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-height:0;padding:4px 8px}
.field{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;min-height:calc(var(--ch)*.85)}
.field .card{--cw:clamp(52px,9vw,82px)}
.fieldwho{font-size:13px;opacity:.85;min-height:18px}
.log{font-size:12px;opacity:.8;text-align:center;line-height:1.5;max-height:6em;overflow:hidden}
.me{padding:6px 8px calc(8px + env(safe-area-inset-bottom));background:#0006}
.meinfo{display:flex;justify-content:space-between;align-items:center;font-size:14px;margin-bottom:2px;gap:6px}
.meinfo.turn .nm{color:var(--gold);font-weight:800}
.hand{display:flex;justify-content:flex-start;padding-top:22px;min-height:calc(var(--ch) + 30px);overflow-x:auto;overflow-y:visible}
.hand .card{cursor:pointer;transition:transform .12s}
.hand .card:first-child{margin-left:auto}
.hand .card:last-child{margin-right:auto}
.hand .card.sel{transform:translateY(-20px);box-shadow:0 0 0 3px var(--gold),0 8px 14px #0009}
.hand .card.dim{filter:brightness(.55)}
.btns{display:flex;gap:10px;justify-content:center;margin-top:8px;flex-wrap:wrap;align-items:center}
.btns button{font-size:17px;padding:12px 22px}
.btns label{font-size:14px;display:flex;gap:6px;align-items:center}
.hint{text-align:center;font-size:14px;color:var(--gold);min-height:20px}
.card{width:var(--cw);height:var(--ch);flex:none;background:var(--card);color:var(--ink);border-radius:calc(var(--cw)*.1);border:1px solid #0004;position:relative;box-shadow:0 2px 6px #0006;user-select:none;font-weight:800;font-size:calc(var(--cw)*.3)}
.card.red{color:var(--red)}
.card .rk{position:absolute;left:.3em;top:.15em;font-size:1.05em;line-height:1}
.card .su{position:absolute;left:0;right:0;top:50%;transform:translateY(-30%);text-align:center;font-size:2em;line-height:1}
.card .su2{position:absolute;right:.3em;bottom:.15em;font-size:.9em;line-height:1;transform:rotate(180deg)}
.card.joker{background:linear-gradient(160deg,#fff,#ffe9f5);color:#7b1fa2}
.card.joker .su{font-size:.9em;writing-mode:vertical-rl;letter-spacing:2px;top:50%;transform:translateY(-50%);left:50%;right:auto;margin-left:-.6em}
.card .as{position:absolute;right:.2em;bottom:.15em;font-size:.7em;background:#7b1fa2;color:#fff;border-radius:4px;padding:0 .3em}
/* 演出バナー */
#banner{position:fixed;left:0;right:0;top:34%;display:flex;justify-content:center;pointer-events:none;z-index:40}
.bn{display:none;text-align:center;font-weight:900;padding:14px 40px;border-radius:22px;background:linear-gradient(135deg,#2a2a2a,#000);color:#fff;border:3px solid var(--gold);box-shadow:0 0 40px #000a;animation:pop 1.25s ease both}
.bn .t{font-size:clamp(40px,10vw,84px);letter-spacing:4px;text-shadow:0 0 18px currentColor}
.bn .w{font-size:clamp(14px,3vw,22px);opacity:.85;font-weight:700}
.bn.revolution,.bn.revBack{background:linear-gradient(135deg,#b71c1c,#ff6f00);border-color:#fff;animation:pop 1.4s ease both,shake .5s .1s 2}
.bn.cut{background:linear-gradient(135deg,#f9a825,#ff8f00);color:#3a2a00}
.bn.lock{background:linear-gradient(135deg,#1565c0,#4527a0)}
.bn.jback,.bn.reverse,.bn.skip{background:linear-gradient(135deg,#00897b,#1565c0)}
.bn.death,.bn.foul{background:linear-gradient(135deg,#4a0072,#000)}
.bn.win{background:linear-gradient(135deg,#f9a825,#c62828)}
.bn.out{padding:8px 26px}
.bn.out .t{font-size:clamp(26px,6vw,44px)}
@keyframes pop{0%{transform:scale(.3);opacity:0}15%{transform:scale(1.15);opacity:1}25%{transform:scale(1)}85%{opacity:1}100%{transform:scale(1.05);opacity:0}}
@keyframes shake{0%,100%{translate:0}25%{translate:-10px 4px}75%{translate:10px -4px}}
.modal{position:fixed;inset:0;background:#000b;display:none;align-items:center;justify-content:center;z-index:30;padding:16px}
.modal.on{display:flex}
.modal .box{background:#17382c;border:1px solid #ffffff30;border-radius:18px;padding:18px;max-width:560px;width:100%;max-height:90vh;overflow:auto}
.res{display:flex;justify-content:space-between;padding:8px 10px;border-radius:8px;background:#ffffff14;margin:5px 0;gap:8px}
.res.me{outline:2px solid var(--gold)}
.timer{font-variant-numeric:tabular-nums;color:var(--gold);font-weight:800}
ul.rules{padding-left:18px;line-height:1.7;font-size:14px;margin:6px 0}
.ex{background:#00000040;border-radius:10px;padding:8px 10px;margin:6px 0;font-size:13px;line-height:1.6}
.rule-h{margin:14px 0 4px;font-size:15px;color:var(--gold)}
.note{background:#ffffff14;border-radius:10px;padding:8px 10px;font-size:13px;margin:6px 0}
.chat{display:flex;flex-direction:column;gap:8px}
.chatlog{background:#00000040;border-radius:12px;padding:8px;height:200px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;font-size:14px}
.cm{max-width:86%;align-self:flex-start;background:#ffffff1a;border-radius:12px;padding:6px 10px;line-height:1.45;word-break:break-word}
.cm .cn{display:block;font-size:11px;opacity:.7}
.cm.me{align-self:flex-end;background:#f4c54233;outline:1px solid #f4c54266}
.cm.sys{align-self:center;background:none;font-size:12px;opacity:.6;padding:0}
.chatempty{opacity:.5;text-align:center;margin:auto;font-size:13px}
.stamps{display:flex;gap:6px;flex-wrap:wrap}
.stamps button{padding:6px 10px;font-size:13px}
.drawer{position:fixed;left:0;right:0;top:0;z-index:35;background:#0e2a20;border-bottom:2px solid var(--gold);padding:10px 12px;display:none;box-shadow:0 8px 30px #000a}
.drawer.on{display:block}
.drawer .chatlog{height:min(34dvh,300px)}
.drawer .dh{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
.drawer .dh button{padding:6px 12px}
#chatPop{position:fixed;top:56px;left:50%;transform:translateX(-50%);z-index:33;background:#000d;border:1px solid var(--gold);border-radius:14px;padding:8px 14px;max-width:88%;font-size:14px;display:none;pointer-events:none}
#chatPop b{color:var(--gold);margin-right:6px}
.pubrow{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 12px;border-radius:10px;background:#00000030;margin:6px 0}
.pubrow .info{font-size:13px;opacity:.85;line-height:1.5}
.pubrow .st{display:inline-block;padding:1px 8px;border-radius:99px;background:#2e7d32;color:#fff;font-size:12px;font-weight:700;margin-right:6px}
.pubrow .st.between{background:#ef6c00}
.pubrow button{padding:8px 16px;white-space:nowrap}
#resBox .chatlog{height:max(260px,38dvh)}
#resBox .res.tot{background:#ffffff0d}
#resBtns{position:sticky;bottom:-18px;background:#17382c;padding:10px 0 4px;z-index:2}
#resBox h3{margin:14px 0 4px;font-size:15px;color:var(--gold)}
.waitnote{font-size:13px;opacity:.85;margin:8px 0}
.badge{display:inline-block;min-width:18px;padding:0 5px;border-radius:99px;background:#e53935;color:#fff;font-size:11px;line-height:18px;margin-left:4px}
@media (max-width:600px){.opp .cnt{font-size:20px}.opp{flex-basis:90px}}
</style>
</head>
<body>
<div id="toast"></div>
<div id="banner"><div class="bn" id="bn"></div></div>

<!-- ホーム -->
<section class="screen" id="home">
  <h1>🃏 大富豪オンライン</h1>
  <div class="sub-title">AIと対戦 / 友達とオンライン対戦（3〜10人）</div>
  <div class="panel">
    <h2>プレイヤー名</h2>
    <input id="name" maxlength="12" placeholder="なまえ" style="width:100%">
    <div class="row" style="margin-top:10px">
      <label>パスの操作
        <select id="passMode" onchange="setPassMode(this.value)"><option value="manual">手動（ボタンで押す）</option><option value="auto">自動（出せない時は自動でパス）</option></select>
      </label>
    </div>
  </div>
  <div class="panel">
    <h2>AIと対戦（1人で遊ぶ）</h2>
    <div class="row">
      <select id="aiLevel"><option value="easy">よわい</option><option value="normal" selected>ふつう</option><option value="hard">つよい</option></select>
      <label>人数（自分を含む） <select id="aiSize"></select></label>
      <button onclick="startAI()">対戦スタート</button>
    </div>
  </div>
  <div class="panel" id="pubPanel">
    <h2>📢 募集中の公開部屋</h2>
    <div id="pubList"><div class="note" style="opacity:.6;font-size:13px">読み込み中…</div></div>
    <div style="font-size:12px;opacity:.7;margin-top:6px">ゲームの合間（結果画面）の部屋にも途中参加できます。</div>
  </div>
  <div class="panel">
    <h2>オンライン対戦</h2>
    <div class="row" style="margin-bottom:10px"><label>人数（最大10人） <select id="olSize"></select></label><input id="olPw" maxlength="20" placeholder="パスワード（任意・日本語もOK）"></div>
    <div class="row" style="margin-bottom:10px"><input id="olCode" maxlength="12" placeholder="部屋名（任意・日本語もOK／空欄なら自動）" style="flex:1"></div>
    <div class="row" style="margin-bottom:10px">
      <button onclick="quick()">クイックマッチ</button>
      <button class="sub" onclick="createOnline(false)">部屋を作る（合言葉制）</button>
      <button class="sub" onclick="createOnline(true)">公開部屋を作る</button>
    </div>
    <div class="row">
      <input id="joinCode" maxlength="12" placeholder="部屋コード / 部屋名">
      <input id="joinPw" maxlength="20" placeholder="パスワード（あれば）">
      <button onclick="joinRoom()">参加</button>
    </div>
    <div style="font-size:12px;opacity:.7;margin-top:8px">空席はホストが開始するとAIが埋めます。クイックマッチはパスワードなしの公開部屋に入ります。</div>
  </div>
  <div class="panel">
    <h2>ローカルルール <span style="font-weight:400;font-size:12px;opacity:.7">（作る部屋に適用）</span></h2>
    <div id="homeRules"></div>
  </div>
  <div class="row" style="justify-content:center"><button class="sub" onclick="showRules(true)">ルール説明</button></div>
</section>

<!-- ロビー -->
<section class="screen" id="lobby">
  <h1>ロビー</h1>
  <div class="panel">
    <div class="code" id="lbCode"></div>
    <div class="row" style="justify-content:center;margin-top:8px">
      <button class="sub" onclick="copyLink()">招待リンクをコピー</button>
    </div>
  </div>
  <div class="panel"><h2>メンバー</h2><div id="lbSeats"></div></div>
  <div class="panel" id="lbHostPanel">
    <h2>ホスト設定</h2>
    <div class="row" style="margin-bottom:8px"><label>人数 <select id="lbSize" onchange="act('size',{size:+this.value})"></select></label><input id="lbPw" maxlength="20" placeholder="パスワード（空欄でなし）"><button class="sub" onclick="setPw()">設定</button></div>
    <div class="row">
      <label>AIの強さ <select id="lbLevel" onchange="act('level',{level:this.value})"><option value="easy">よわい</option><option value="normal">ふつう</option><option value="hard">つよい</option></select></label>
      <button onclick="act('start')">ゲーム開始（空席はAI）</button>
    </div>
  </div>
  <div class="panel"><h2>ローカルルール</h2>
    <div id="lbRules"></div>
  </div>
  <div class="panel"><h2>💬 チャット</h2>
    <div class="chat">
      <div class="chatlog"></div>
      <div class="stamps"></div>
      <div class="row"><input id="lcIn" maxlength="200" placeholder="メッセージを入力（Enterで送信）" autocomplete="off"><button onclick="sendChat('lcIn')">送信</button></div>
    </div>
  </div>
  <div id="lbWait" class="hint" style="display:none">ホストの開始を待っています…</div>
  <div id="lbInfo" class="hint"></div>
  <div class="row" style="justify-content:center"><button class="sub" onclick="showRules()">ルール説明</button><button class="sub" onclick="leave()">退出</button></div>
</section>

<!-- ゲーム -->
<section class="screen" id="game">
  <div class="top">
    <div class="chiprow" id="chips"></div>
    <div class="row"><span class="timer" id="timer"></span>
      <button class="sub" id="chatBtn" style="padding:4px 10px;display:none" onclick="toggleChat()">💬<span class="badge" id="chatBadge" style="display:none"></span></button>
      <button class="sub" id="passBtnMode" style="padding:4px 10px" onclick="togglePassMode()"></button>
      <button class="sub" style="padding:4px 10px" onclick="showRules()">ルール</button>
      <button class="sub" style="padding:4px 10px" onclick="leave(true)">退出</button></div>
  </div>
  <div class="opps" id="opps"></div>
  <div class="center">
    <div class="fieldwho" id="fieldWho"></div>
    <div class="field" id="field"></div>
    <div class="log" id="log"></div>
  </div>
  <div class="me">
    <div class="meinfo" id="meinfo"></div>
    <div class="hint" id="hint"></div>
    <div class="hand" id="hand"></div>
    <div class="btns" id="btns"></div>
  </div>
</section>

<div id="chatPop"></div>
<div class="drawer" id="chatDrawer">
  <div class="dh"><b>💬 チャット</b><button class="sub" onclick="toggleChat(false)">閉じる</button></div>
  <div class="chat">
    <div class="chatlog"></div>
    <div class="stamps"></div>
    <div class="row"><input id="gcIn" maxlength="200" placeholder="メッセージ（Enterで送信）" autocomplete="off"><button onclick="sendChat('gcIn')">送信</button></div>
  </div>
</div>
<div class="modal" id="resModal"><div class="box" id="resBox">
  <div id="resTop"></div>
  <h3>💬 チャット</h3>
  <div class="chat">
    <div class="chatlog"></div>
    <div class="stamps"></div>
    <div class="row"><input id="rcIn" maxlength="200" placeholder="メッセージ（Enterで送信）" autocomplete="off" style="flex:1"><button onclick="sendChat('rcIn')">送信</button></div>
  </div>
  <div id="resBtns" style="margin-top:12px"></div>
</div></div>
<div class="modal" id="rulesModal" onclick="this.classList.remove('on')"><div class="box" onclick="event.stopPropagation()" id="rulesBox"></div></div>

<script>
const $ = (s) => document.querySelector(s);
const SYM = {S:'♠',H:'♥',D:'♦',C:'♣'};
const LABEL = {3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A',15:'2',16:'JK'};
let sess = null, S = null, es = null, sel = new Set(), deadlineAt = 0;
let RULES = [], UNSUP = [], DEFAULTS = {};
let homeRules = {}, starFilter = 'all', openG = new Set(['カードの効果']);
const resCache = { top: '', btns: '' };
let passMode = 'manual', lastEv = null, autoTok = '', bnQueue = [], bnBusy = false;
try { sess = JSON.parse(sessionStorage.getItem('dfg') || 'null'); } catch (e) {}
try { passMode = localStorage.getItem('dfgPass') === 'auto' ? 'auto' : 'manual'; } catch (e) {}

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => t.style.display = 'none', 2600); }
function screen(id) { document.querySelectorAll('.screen').forEach((e) => e.classList.toggle('on', e.id === id)); }
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
async function api(path, body) {
  try {
    const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) { toast(j.error || 'エラー'); return null; }
    return j;
  } catch (e) { toast('通信エラー'); return null; }
}
const myName = () => { const n = $('#name').value.trim() || 'ゲスト'; try { localStorage.setItem('dfgName', n); } catch (e) {} return n; };

// ---- パス設定 ----
function setPassMode(m) { passMode = m === 'auto' ? 'auto' : 'manual'; try { localStorage.setItem('dfgPass', passMode); } catch (e) {} $('#passMode').value = passMode; updPassBtn(); if (S && S.game) renderGame(); }
function togglePassMode() { setPassMode(passMode === 'auto' ? 'manual' : 'auto'); toast(passMode === 'auto' ? 'パス：自動（出せない時は自動でパス）' : 'パス：手動'); }
function updPassBtn() { const b = $('#passBtnMode'); if (b) b.textContent = 'パス：' + (passMode === 'auto' ? '自動' : '手動'); }

// ---- ルール選択 ----
const sig = (st) => RULES.map((r) => (st[r.id] ? '1' : '0')).join('');
function stars(n) { return n > 0 ? '★'.repeat(n) : '☆'; }
function filterOK(r) {
  if (starFilter === 'all') return true;
  if (starFilter === '5') return r.stars >= 5;
  if (starFilter === '3+') return r.stars >= 3;
  if (starFilter === '3-') return r.stars <= 3;
  if (starFilter === '1-2') return r.stars <= 2;
  return true;
}
function buildPicker(box, st, editable, onChange) {
  box._sig = sig(st) + (editable ? 'e' : 'r') + starFilter;
  const prevScroll = window.scrollY;
  const groups = [];
  RULES.filter(filterOK).forEach((r) => { let g = groups.find((x) => x.name === r.group); if (!g) groups.push(g = { name: r.group, list: [] }); g.list.push(r); });
  let html = '';
  if (editable) {
    html += '<div class="rp-bar"><label>表示 <select class="rp-f"><option value="all">すべて</option><option value="5">★5（よく使う）のみ</option><option value="3+">★3以上</option><option value="3-">★3まで</option><option value="1-2">★1〜2（あまり使わない）</option></select></label><button class="sub rp-def">標準に戻す</button><button class="sub rp-off">すべてOFF</button></div>';
  } else html += '<div class="chiprow">' + (RULES.filter((r) => st[r.id]).map((r) => '<span class="chip">' + esc(r.name) + '</span>').join('') || '<span class="chip">ルールなし</span>') + '</div>';
  if (editable) {
    for (const g of groups) {
      const on = g.list.filter((r) => st[r.id]).length;
      html += '<details class="rg" data-g="' + esc(g.name) + '"' + (openG.has(g.name) ? ' open' : '') + '><summary><span>' + esc(g.name) + '</span><span class="cnt">ON ' + on + ' / ' + g.list.length + '</span></summary><div class="rl">' +
        g.list.map((r) => '<label class="' + (st[r.id] ? 'on' : '') + '"><input type="checkbox" data-id="' + r.id + '"' + (st[r.id] ? ' checked' : '') + '><span><span class="nm">' + esc(r.name) + '</span><span class="st">' + stars(r.stars) + '</span><small>' + esc(r.desc) + '</small></span></label>').join('') + '</div></details>';
    }
    html += '<div style="font-size:11px;opacity:.65;margin-top:6px">★が多いほど、よく使われるルールです。未対応: ' + esc(UNSUP.join('、')) + '</div>';
  }
  box.innerHTML = html;
  window.scrollTo(0, prevScroll);
  if (!editable) return;
  const f = box.querySelector('.rp-f'); f.value = starFilter;
  f.onchange = () => { starFilter = f.value; buildPicker(box, st, editable, onChange); };
  box.querySelector('.rp-def').onclick = () => { RULES.forEach((r) => (st[r.id] = !!DEFAULTS[r.id])); buildPicker(box, st, editable, onChange); onChange(st); };
  box.querySelector('.rp-off').onclick = () => { RULES.forEach((r) => (st[r.id] = false)); buildPicker(box, st, editable, onChange); onChange(st); };
  box.querySelectorAll('details.rg').forEach((d) => d.addEventListener('toggle', () => { if (d.open) openG.add(d.dataset.g); else openG.delete(d.dataset.g); }));
  box.querySelectorAll('input[type=checkbox]').forEach((cb) => (cb.onchange = () => {
    st[cb.dataset.id] = cb.checked;
    cb.closest('label').classList.toggle('on', cb.checked);
    box._sig = sig(st) + 'e' + starFilter;
    box.querySelectorAll('details.rg').forEach((d) => { const l = RULES.filter((r) => r.group === d.dataset.g && filterOK(r)); d.querySelector('.cnt').textContent = 'ON ' + l.filter((r) => st[r.id]).length + ' / ' + l.length; });
    onChange(st);
  }));
}
function saveHome() { try { localStorage.setItem('dfgRules', JSON.stringify(homeRules)); } catch (e) {} }
function initRules(j) {
  RULES = j.rules; UNSUP = j.unsupported; DEFAULTS = j.defaults;
  let saved = {}; try { saved = JSON.parse(localStorage.getItem('dfgRules') || '{}'); } catch (e) {}
  homeRules = {}; RULES.forEach((r) => (homeRules[r.id] = typeof saved[r.id] === 'boolean' ? saved[r.id] : !!DEFAULTS[r.id]));
  buildPicker($('#homeRules'), homeRules, true, saveHome);
  if (S) render();
}

// ---- 作成/参加 ----
function enter(j) { sess = { room: j.room, token: j.token }; try { sessionStorage.setItem('dfg', JSON.stringify(sess)); } catch (e) {} history.replaceState(null, '', '?room=' + encodeURIComponent(j.room)); lastEv = null; resetChat(); connect(); }
const rulePayload = () => ({ rules: homeRules });
async function startAI() { saveHome(); const j = await api('/api/create', Object.assign({ name: myName(), mode: 'ai', level: $('#aiLevel').value, size: +$('#aiSize').value }, rulePayload())); if (j) enter(j); }
async function createOnline(pub) { saveHome(); const j = await api('/api/create', Object.assign({ name: myName(), mode: 'online', pub, size: +$('#olSize').value, password: $('#olPw').value, code: $('#olCode').value }, rulePayload())); if (j) enter(j); }
async function quick() { const j = await api('/api/quick', { name: myName() }); if (j) enter(j); }
async function joinRoom() { const j = await api('/api/join', { name: myName(), room: $('#joinCode').value.trim(), password: $('#joinPw').value }); if (j) enter(j); }
// ---- 公開部屋の募集一覧 ----
let pubTimer = null;
async function loadPub() {
  const box = $('#pubList');
  if (!box) return;
  try {
    const list = await (await fetch('/api/rooms', { cache: 'no-store' })).json();
    box.innerHTML = list.length ? list.map((r, i) => '<div class="pubrow"><div class="info"><span class="st' + (r.status === 'between' ? ' between' : '') + '">' + (r.status === 'between' ? '途中参加OK' : '募集中') + '</span>' + (r.locked ? '🔒 ' : '') + '<b>' + esc(r.code) + '</b><br>ホスト: ' + esc(r.host) + '　' + r.players + '/' + r.size + '人' + (r.status === 'between' ? '　第' + r.round + 'ラウンド後' : '') + '</div><button data-i="' + i + '">参加</button></div>').join('') : '<div style="opacity:.6;font-size:13px">いま募集中の公開部屋はありません。「公開部屋を作る」で作れます。</div>';
    box.querySelectorAll('button').forEach((b) => (b.onclick = () => joinPub(list[+b.dataset.i])));
  } catch (e) { /* ignore */ }
}
async function joinPub(r) {
  let pw = '';
  if (r.locked) { pw = prompt('この部屋のパスワードを入力してください') ; if (pw == null) return; }
  const j = await api('/api/join', { name: myName(), room: r.code, password: pw });
  if (j) enter(j); else loadPub();
}
function startPubPolling() { clearInterval(pubTimer); loadPub(); pubTimer = setInterval(() => { if (!S && !document.hidden) loadPub(); }, 4000); }
function act(type, extra) { if (!sess) return Promise.resolve(null); return api('/api/action', Object.assign({ room: sess.room, token: sess.token, type }, extra || {})); }
async function leave(confirmFirst) {
  if (confirmFirst && !confirm('退出しますか？（AIが代わりに続けます）')) return;
  await act('leave');
  reset();
}
function reset() {
  if (es) es.close(); es = null; S = null; sess = null; sel.clear();
  try { sessionStorage.removeItem('dfg'); } catch (e) {} history.replaceState(null, '', location.pathname);
  $('#resModal').classList.remove('on'); resCache.top = resCache.btns = ''; resetChat(); screen('home'); loadPub();
}
function copyLink() {
  const url = location.origin + '/?room=' + encodeURIComponent(S.room);
  (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast('コピーしました'), () => prompt('招待リンク', url));
}
function setPw() { act('password', { password: $('#lbPw').value }).then((r) => r && toast($('#lbPw').value ? 'パスワードを設定しました' : 'パスワードを解除しました')); }
let rulesTimer = null;
let lobbyRules = {};
function lobbyChanged(st) { lobbyRules = st; clearTimeout(rulesTimer); rulesTimer = setTimeout(() => act('rules', { rules: st }), 350); }

// ---- ルール説明 ----
function showRules(fromHome) {
  const st = fromHome || !S ? homeRules : (S.rules || homeRules);
  const on = RULES.filter((r) => st[r.id]);
  $('#rulesBox').innerHTML = '<h2 style="margin-top:0">ルール説明</h2>' +
    '<div class="rule-h">基本</div><ul class="rules"><li>強さ: 3 &lt; 4 &lt; … &lt; 10 &lt; J &lt; Q &lt; K &lt; A &lt; 2 &lt; ジョーカー（ジョーカーは2枚・ワイルドカード）</li>' +
    '<li>場と<b>同じ枚数</b>で、<b>より強い札</b>を出します。同じ数字の組（ペア・3枚・4枚）や、階段（同じマークの連続）が出せます。</li>' +
    '<li>出せない・出したくないときは<b>パス</b>。全員がパスすると場が流れ、最後に出した人からまた始まります。</li>' +
    '<li>手札を早くなくした順に、大富豪 → … → 大貧民。順位に応じて点が入ります。2ラウンド目以降は、大貧民から大富豪へ強い札を渡す「カード交換」があります。</li></ul>' +
    '<div class="rule-h">8切り</div><div class="ex">8を出すと、その場のカードが流れて<b>同じ人がもう一度</b>出せます。<br>例: 場に「♠9」→ あなたが「♥8」を出す → 場が流れ、あなたが好きな札から始められる。</div>' +
    '<div class="rule-h">革命</div><div class="ex">同じ数字を<b>4枚以上</b>同時に出す（階段は5枚以上）と、<b>強さが逆転</b>します。3が最強、2が最弱（ジョーカーは最強のまま）。<br>例: 「♠5 ♥5 ♦5 ♣5」を出す → 画面に<b>「革命！」</b>と表示され、以降は小さい数字ほど強くなる。</div>' +
    '<div class="rule-h">革命返し</div><div class="ex">革命が起きている間にもう一度革命を起こすと、<b>強さが元に戻ります</b>。<br>例: 革命中に「♠9 ♥9 ♦9 ♣9」を出す → <b>「革命返し！」</b>と表示され、通常の強さに戻る。</div>' +
    '<div class="rule-h">その他の基本</div><ul class="rules"><li><b>縛り</b>: 場と同じマークの札が続けて出されると、以降そのマークしか出せません。</li><li><b>スペ3返し</b>: ジョーカー単体には、♠3単体で勝てます。</li><li>オンラインでは1手45秒。時間切れ・切断時はAIが代打します。</li><li>パスは「手動／自動」を切り替えられます（自動なら出せる札がないとき自動でパス）。</li></ul>' +
    '<div class="rule-h">この部屋で有効なローカルルール（' + on.length + '個）</div>' +
    (on.length ? '<div class="rl" style="padding:0">' + on.map((r) => '<label class="on" style="cursor:default"><span><span class="nm">' + esc(r.name) + '</span><span class="st">' + stars(r.stars) + '</span><small>' + esc(r.desc) + '</small></span></label>').join('') + '</div>' : '<div class="note">ローカルルールはありません。</div>') +
    '<div style="margin-top:12px"><button onclick="document.getElementById(\\'rulesModal\\').classList.remove(\\'on\\')">閉じる</button></div>';
  $('#rulesModal').classList.add('on');
}

// ---- チャット ----
const STAMPS = ['よろしく！', 'ナイス！', 'まって〜', 'ありがとう', 'GG', 'もう一回！'];
let chatLog = [], chatLast = 0, chatUnread = 0, chatOpen = false, popTimer = null;
function resetChat() { chatLog = []; chatLast = 0; chatUnread = 0; chatOpen = false; const d = $('#chatDrawer'); if (d) d.classList.remove('on'); renderChat(); updateChatUI(); }
function onChat(m) {
  if (!m || m.id <= chatLast) return;
  chatLast = m.id;
  chatLog.push(m);
  if (chatLog.length > 120) chatLog.shift();
  const inLobby = S && (S.phase === 'lobby' || (S.game && S.game.phase === 'end'));
  const mine = S && m.seat === S.you && !m.sys;
  if (!inLobby && !chatOpen && !mine && !m.sys) { chatUnread++; popChat(m); }
  renderChat();
  updateChatUI();
}
function popChat(m) {
  const el = $('#chatPop');
  el.innerHTML = '<b>' + esc(m.name) + '</b>' + esc(m.text);
  el.style.display = 'block';
  clearTimeout(popTimer);
  popTimer = setTimeout(() => (el.style.display = 'none'), 5000);
}
function renderChat() {
  const me = S ? S.you : -1;
  const html = chatLog.length ? chatLog.map((m) => m.sys
    ? '<div class="cm sys">' + esc(m.text) + '</div>'
    : '<div class="cm' + (m.seat === me ? ' me' : '') + '"><span class="cn">' + esc(m.name) + '</span>' + esc(m.text) + '</div>').join('')
    : '<div class="chatempty">まだメッセージはありません</div>';
  document.querySelectorAll('.chatlog').forEach((box) => {
    const near = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
    box.innerHTML = html;
    if (near || !box._init) { box.scrollTop = box.scrollHeight; box._init = true; }
  });
}
function updateChatUI() {
  const humans = S ? S.seats.filter((x) => x.type === 'human').length : 0;
  const btn = $('#chatBtn');
  if (btn) btn.style.display = humans >= 2 ? '' : 'none';
  const b = $('#chatBadge');
  if (b) { b.style.display = chatUnread ? 'inline-block' : 'none'; b.textContent = chatUnread; }
  if (humans < 2 && chatOpen) toggleChat(false);
}
function toggleChat(open) {
  chatOpen = open == null ? !chatOpen : open;
  $('#chatDrawer').classList.toggle('on', chatOpen);
  if (chatOpen) { chatUnread = 0; $('#chatPop').style.display = 'none'; document.querySelectorAll('.chatlog').forEach((b) => (b.scrollTop = b.scrollHeight)); }
  updateChatUI();
}
function sendChat(inputId, text) {
  const inp = document.getElementById(inputId);
  const t = (text != null ? text : inp.value).trim();
  if (!t) return;
  if (text == null) inp.value = '';
  act('chat', { text: t }).then((r) => { if (!r && text == null) inp.value = t; });
}
function initChat() {
  document.querySelectorAll('.stamps').forEach((box) => {
    box.innerHTML = STAMPS.map((t) => '<button class="sub" type="button">' + esc(t) + '</button>').join('');
    box.querySelectorAll('button').forEach((b, i) => (b.onclick = () => sendChat(null, STAMPS[i])));
  });
  for (const id of ['lcIn', 'gcIn', 'rcIn']) {
    document.getElementById(id).addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); sendChat(id); } });
  }
}

// ---- 接続 ----
function connect() {
  if (es) es.close();
  es = new EventSource('/api/events?room=' + encodeURIComponent(sess.room) + '&token=' + sess.token);
  es.addEventListener('chat', (e) => { try { onChat(JSON.parse(e.data)); } catch (err) {} });
  es.onmessage = (e) => { S = JSON.parse(e.data); const g = S.game; deadlineAt = g && g.timeLeft != null ? Date.now() + g.timeLeft : 0; handleEvents(); render(); updateChatUI(); };
  es.onerror = () => { if (es.readyState === 2) { toast('部屋に接続できませんでした'); reset(); } };
}
function handleEvents() {
  const g = S && S.game;
  if (!g) { lastEv = null; return; }
  if (lastEv === null) { lastEv = g.evSeq; return; }
  if (g.evSeq < lastEv) lastEv = 0;
  for (const e of g.events) if (e.id > lastEv) bnQueue.push(e);
  lastEv = g.evSeq;
  if (bnQueue.length > 4) bnQueue = bnQueue.slice(-4);
  runBanner();
}
function runBanner() {
  if (bnBusy || !bnQueue.length) return;
  bnBusy = true;
  const e = bnQueue.shift();
  const el = $('#bn');
  el.className = 'bn ' + e.kind;
  const who = e.seat >= 0 && S && S.seats[e.seat] ? S.seats[e.seat].name : '';
  el.innerHTML = '<div class="t">' + esc(e.text) + '</div>' + (who ? '<div class="w">' + esc(who) + (e.seat === S.you ? '（あなた）' : '') + '</div>' : '');
  el.style.display = 'block';
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  const ms = e.kind === 'out' ? 900 : 1350;
  setTimeout(() => { el.style.display = 'none'; bnBusy = false; runBanner(); }, ms);
}

// ---- カード描画 ----
function cardEl(c, cls) {
  const d = document.createElement('div');
  const joker = c.r === 16;
  d.className = 'card' + (joker ? ' joker' : '') + (c.s === 'H' || c.s === 'D' ? ' red' : '') + (cls ? ' ' + cls : '');
  if (joker) d.innerHTML = '<span class="rk">★</span><span class="su">JOKER</span>' + (c.as ? '<span class="as">' + LABEL[c.as] + '</span>' : '');
  else d.innerHTML = '<span class="rk">' + LABEL[c.r] + '</span><span class="su">' + SYM[c.s] + '</span><span class="su2">' + SYM[c.s] + '</span>';
  return d;
}
const key = (ids) => ids.slice().sort((a, b) => a - b).join(',');

function render() {
  if (!S) return;
  if (S.phase === 'lobby') { $('#resModal').classList.remove('on'); renderLobby(); screen('lobby'); }
  else { screen('game'); renderGame(); }
}
function renderLobby() {
  $('#lbCode').textContent = S.room;
  $('#lbSeats').innerHTML = S.seats.map((s, i) => '<div class="seat"><span>' + (s.type === 'empty' ? '<span style="opacity:.5">空席（AIが入ります）</span>' : esc(s.name)) + (i === S.you ? ' <span class="tag">（あなた）</span>' : '') + (i === S.host ? ' <span class="tag">👑ホスト</span>' : '') + '</span><span class="tag">' + (s.type === 'human' ? (s.online ? '● オンライン' : '○ 切断中') : '') + '</span></div>').join('');
  const host = S.you === S.host;
  $('#lbHostPanel').style.display = host ? '' : 'none';
  $('#lbWait').style.display = host ? 'none' : '';
  $('#lbLevel').value = S.level;
  const sz = $('#lbSize');
  if (!sz.options.length) for (let k = 3; k <= 10; k++) sz.add(new Option(k + '人', k));
  sz.value = S.size;
  const pw = $('#lbPw'); if (document.activeElement !== pw) pw.value = S.password || '';
  const box = $('#lbRules');
  if (RULES.length && S.rules) {
    const want = sig(S.rules) + (host ? 'e' : 'r') + starFilter;
    if (box._sig !== want) { lobbyRules = Object.assign({}, S.rules); buildPicker(box, lobbyRules, host, lobbyChanged); }
  }
  const humansN = S.seats.filter((x) => x.type === 'human').length;
  $('#lbInfo').textContent = S.size + '人で開始（参加' + humansN + '人 + AI' + (S.size - humansN) + '人）' + (S.locked ? ' 🔒パスワードあり' : '');
}

function fitHand(hand) {
  const cards = hand.children;
  const n = cards.length;
  if (n < 2) return;
  const cw = cards[0].getBoundingClientRect().width;
  if (!cw) return;
  const avail = hand.clientWidth - 8;
  let gap = 6;
  if (n * cw + (n - 1) * gap > avail) gap = (avail - cw) / (n - 1) - cw;
  gap = Math.max(gap, -cw * 0.78);
  for (let i = 1; i < n; i++) cards[i].style.marginLeft = gap + 'px';
}

function renderGame() {
  const g = S.game, you = S.you, n = S.seats.length;
  const legalKeys = new Set((g.legal || []).map(key));
  const legalIds = new Set((g.legal || []).flat());
  const myTurn = g.phase === 'play' && g.turn === you;
  updPassBtn();
  // チップ
  const chips = ['<span class="chip">ROUND ' + S.round + '</span>', '<span class="chip">' + (g.dir === 1 ? '順回り ↻' : '逆回り ↺') + '</span>'];
  if (g.effRev) chips.push('<span class="chip red">強さ逆転中</span>');
  if (g.rev) chips.push('<span class="chip hot">革命</span>');
  if (g.jb) chips.push('<span class="chip hot">バック</span>');
  if (g.lock) chips.push('<span class="chip hot">縛り ' + g.lock.map((s) => SYM[s]).join('') + (g.lockSeq ? ' 続き番号' : '') + '</span>');
  if (g.arthur) chips.push('<span class="chip hot">ジョーカー弱体</span>');
  if (g.omen) chips.push('<span class="chip hot">オーメン</span>');
  if (g.cut8) chips.push('<span class="chip red">切り対抗待ち</span>');
  if (g.mustD3) chips.push('<span class="chip hot">♦3から</span>');
  $('#chips').innerHTML = chips.join('');
  // 相手（席順に並べる）
  const oppEl = $('#opps'); oppEl.innerHTML = '';
  const ord = g.order, my = ord.indexOf(you);
  for (let k = 1; k < n; k++) {
    const i = ord[(my + k) % n], st = S.seats[i];
    const el = document.createElement('div');
    el.className = 'opp' + (g.phase === 'play' && g.turn === i ? ' turn' : '');
    el.innerHTML = (g.passed[i] ? '<span class="pass">パス</span>' : '') +
      '<div class="nm ' + (st.online ? '' : 'off') + '">' + esc(st.name) + '</div>' +
      '<div class="ttl">' + (g.places.includes(i) ? '🏁' + (g.places.indexOf(i) + 1) + '位' : '') + '</div>' +
      '<div class="cnt">' + g.counts[i] + '<small>枚</small></div><div class="pt">' + st.score + '点</div>';
    oppEl.appendChild(el);
  }
  // 場
  const f = $('#field'); f.innerHTML = '';
  if (g.field) { g.field.cards.forEach((c) => f.appendChild(cardEl(c))); $('#fieldWho').textContent = S.seats[g.field.player].name + ' の手'; }
  else $('#fieldWho').textContent = g.phase === 'play' ? '場は空です（好きな札から）' : '';
  $('#log').innerHTML = g.log.slice(-4).map((l) => '<div>' + (l.s >= 0 ? esc(S.seats[l.s].name) + ': ' : '') + esc(l.t) + '</div>').join('');
  // 自分
  const meTurn = myTurn || (g.phase === 'exchange' && g.exchange.youNeed > 0);
  $('#meinfo').className = 'meinfo' + (meTurn ? ' turn' : '');
  $('#meinfo').innerHTML = '<span class="nm">' + esc(S.seats[you].name) + (g.places.includes(you) ? '　🏁' + (g.places.indexOf(you) + 1) + '位で上がり' : '') + '</span><span>' + S.seats[you].score + '点</span>';
  const hand = $('#hand'); hand.innerHTML = '';
  const ids = new Set(g.hand.map((c) => c.id));
  for (const id of [...sel]) if (!ids.has(id)) sel.delete(id);
  const recv = new Set(g.exchange ? g.exchange.received : []);
  g.hand.forEach((c) => {
    let cls = '';
    if (sel.has(c.id)) cls += ' sel';
    if (myTurn && !legalIds.has(c.id)) cls += ' dim';
    const el = cardEl(c, cls.trim());
    if (recv.has(c.id)) el.style.outline = '3px dashed #6cf';
    el.onclick = () => { if (sel.has(c.id)) sel.delete(c.id); else sel.add(c.id); renderGame(); };
    hand.appendChild(el);
  });
  fitHand(hand);
  // ボタン
  const btns = $('#btns'); btns.innerHTML = '';
  const hint = $('#hint');
  const selIds = [...sel];
  if (g.phase === 'exchange') {
    const need = g.exchange.youNeed;
    if (need > 0) {
      hint.textContent = 'カード交換: 相手に渡す札を ' + need + ' 枚選んでください（点線は受け取った札）';
      btns.innerHTML = '<button id="giveBtn" ' + (selIds.length === need ? '' : 'disabled') + '>渡す</button>';
      $('#giveBtn').onclick = async () => { const r = await act('give', { ids: selIds }); if (r) sel.clear(); };
    } else hint.textContent = 'カード交換中…';
  } else if (g.phase === 'play') {
    if (myTurn) {
      const canPlay = legalKeys.has(key(selIds));
      const noMove = g.legal.length === 0;
      hint.textContent = noMove ? (passMode === 'auto' ? '出せる札がないので自動でパスします…' : '出せる札がありません。パスしてください') : (g.field ? '場より強い札を選んで「出す」' : 'あなたが先攻です。好きな札を選んで「出す」');
      const rc = S.rules && S.rules.revChoice ? '<label><input type="checkbox" id="noRev"> 革命しない</label>' : '';
      btns.innerHTML = rc + '<button id="playBtn" ' + (canPlay ? '' : 'disabled') + '>出す</button>' +
        '<button id="passBtn" class="sub" ' + (g.field ? '' : 'disabled') + '>パス</button>' +
        '<button id="clrBtn" class="sub" ' + (selIds.length ? '' : 'disabled') + '>選択解除</button>';
      $('#playBtn').onclick = async () => { const nr = $('#noRev'); const r = await act('play', { ids: selIds, noRev: !!(nr && nr.checked) }); if (r) sel.clear(); };
      $('#passBtn').onclick = () => act('pass');
      $('#clrBtn').onclick = () => { sel.clear(); renderGame(); };
      // 自動パス
      const tok = S.round + ':' + g.turn + ':' + g.log.length + ':' + g.counts.join(',');
      if (passMode === 'auto' && noMove && g.field && autoTok !== tok) {
        autoTok = tok;
        setTimeout(() => { if (S && S.game && S.game.turn === you && S.game.phase === 'play' && passMode === 'auto' && S.game.log.length === g.log.length) act('pass'); }, 900);
      }
    } else if (g.places.includes(you)) hint.textContent = '上がりました！ 他のプレイヤーを待っています';
    else hint.textContent = S.seats[g.turn].name + ' の番です';
  } else hint.textContent = '';
  // 結果
  const modal = $('#resModal');
  if (g.phase === 'end' && g.results) {
    const last = g.results.map((r) => '<div class="res' + (r.seat === you ? ' me' : '') + '"><span>' + (r.place + 1) + '位 ' + r.title + '　' + esc(S.seats[r.seat].name) + '</span><span>+' + r.add + '点</span></div>').join('');
    const tot = S.seats.map((x, i) => ({ i, x })).sort((a, b) => b.x.score - a.x.score || b.x.wins - a.x.wins || a.i - b.i);
    let rk = 0, prevScore = null;
    const total = tot.map((t, idx) => {
      if (t.x.score !== prevScore) { rk = idx + 1; prevScore = t.x.score; }
      return '<div class="res tot' + (t.i === you ? ' me' : '') + '"><span>' + rk + '位　' + esc(t.x.name) + (t.x.type === 'human' && !t.x.online ? ' <small style="opacity:.6">(切断中)</small>' : '') + '</span><span>' + t.x.score + '点　<small style="opacity:.7">👑' + (t.x.wins || 0) + '回</small></span></div>';
    }).join('');
    const top = '<h2 style="margin-top:0">ラウンド ' + S.round + ' 結果</h2><h3 style="margin-top:4px">直前の結果</h3>' + last + '<h3>総合ランキング（' + S.round + 'ラウンド累計）</h3>' + total;
    if (resCache.top !== top) { $('#resTop').innerHTML = top; resCache.top = top; }
    const iReady = (g.ready || []).includes(you);
    const names = (g.waiting || []).map((i) => esc(S.seats[i].name)).join('、');
    const btns = '<div class="waitnote">' + (g.waiting && g.waiting.length ? (iReady ? '✅ 準備OK！ ほかの人を待っています：' : '全員が「次へ」を押すと始まります。待ち：') + names : '全員そろいました') + '</div>' +
      '<div class="row"><button id="nextBtn"' + (iReady ? ' disabled' : '') + ' onclick="act(\\'next\\')">' + (iReady ? '準備OK（待機中）' : '次のラウンドを始める') + '</button>' +
      (S.you === S.host ? '<button class="sub" onclick="act(\\'lobby\\')">ロビーに戻る</button>' : '') +
      '<button class="sub" onclick="leave()">退出</button></div>';
    if (resCache.btns !== btns) { $('#resBtns').innerHTML = btns; resCache.btns = btns; }
    if (!modal.classList.contains('on')) { modal.classList.add('on'); renderChat(); }
  } else { modal.classList.remove('on'); resCache.top = resCache.btns = ''; }
}
window.addEventListener('resize', () => { if (S && S.game && S.phase !== 'lobby') fitHand($('#hand')); });
setInterval(() => {
  const t = $('#timer');
  if (!t) return;
  if (deadlineAt && S && S.game) { const s = Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000)); t.textContent = '⏱ ' + s + 's'; }
  else t.textContent = '';
}, 250);

// 起動
(function init() {
  try { $('#name').value = localStorage.getItem('dfgName') || ''; } catch (e) {}
  for (const id of ['aiSize', 'olSize']) { const el = document.getElementById(id); for (let k = 3; k <= 10; k++) el.add(new Option(k + '人', k)); el.value = 4; }
  $('#passMode').value = passMode;
  initChat();
  startPubPolling();
  const q = new URLSearchParams(location.search).get('room');
  fetch('/api/rules').then((r) => r.json()).then(initRules).catch(() => toast('ルール一覧を読み込めませんでした'));
  if (sess && (!q || q.toUpperCase() === String(sess.room).toUpperCase())) { screen('home'); connect(); return; }
  if (q) $('#joinCode').value = q;
  screen('home');
})();
</script>
</body>
</html>
`;

// 大富豪サーバー: 依存パッケージなし。HTTP + Server-Sent Events(受信) + POST(送信)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');


const PORT = process.env.PORT || 3000;

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 10;
const AI_NAMES = ['タロウ', 'ハナコ', 'ケンタ', 'ミユ', 'ソウタ', 'アカリ', 'ダイスケ', 'サクラ', 'リク', 'ナナミ'];
function titlesFor(n) {
  const t = [];
  for (let i = 0; i < n; i++) {
    if (i === 0) t.push('大富豪');
    else if (i === n - 1) t.push('大貧民');
    else if (n >= 4 && i === 1) t.push('富豪');
    else if (n >= 4 && i === n - 2) t.push('貧民');
    else t.push('平民');
  }
  return t;
}
const clampSize = (n) => Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, parseInt(n, 10) || 4));
const cleanPw = (p) => String(p == null ? '' : p).normalize('NFKC').trim().slice(0, 20); // 日本語など何でもOK
const normCode = (c) => String(c == null ? '' : c).normalize('NFKC').replace(/[<>\s]/g, '').toUpperCase().slice(0, 12);
const getRoom = (c) => rooms.get(normCode(c));
const TURN_MS = 45000;
const AI_DELAY = Number(process.env.AI_DELAY_MS || 800); // AIの思考待ち(ms)。テスト時は短くできる
const LEVELS = ['easy', 'normal', 'hard'];
const rooms = new Map();


// ---- 部屋 ---------------------------------------------------------------
function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += A[crypto.randomInt(A.length)];
    if (!rooms.has(c)) return c;
  }
}
const cleanName = (n) => String(n || '').replace(/[<>\n\r]/g, '').trim().slice(0, 12) || 'ゲスト';
const emptySeat = () => ({ type: 'empty', name: '', token: null, conn: 0, lastSeen: 0 });

function createRoom(name, pub, level, size, password, rules, customCode) {
  size = clampSize(size);
  const code = customCode || newCode();
  const room = {
    code, pub: !!pub, password: cleanPw(password), rules: G.normRules(rules), maintained: false, phase: 'lobby', host: 0, level: LEVELS.includes(level) ? level : 'normal',
    seats: Array.from({ length: size }, emptySeat), scores: Array(size).fill(0), wins: Array(size).fill(0), round: 0, ready: new Set(),
    chat: [], chatSeq: 0, g: null, clients: new Set(), timer: null, deadline: null, lastResults: null, scored: false,
    updated: Date.now(),
  };
  rooms.set(code, room);
  const token = seatHuman(room, 0, name);
  return { room, token };
}
function seatHuman(room, i, name) {
  const token = crypto.randomUUID();
  room.seats[i] = { type: 'human', name: cleanName(name), token, conn: 0, lastSeen: Date.now() };
  return token;
}
const seatByToken = (room, token) => room.seats.findIndex((s) => s.type === 'human' && s.token && s.token === token);
const humans = (room) => room.seats.filter((s) => s.type === 'human').length;
function isBot(room, i) {
  const s = room.seats[i];
  if (s.type === 'ai') return true;
  return s.type === 'human' && s.conn === 0 && Date.now() - s.lastSeen > 3000;
}

function fillAI(room) {
  const used = new Set(room.seats.map((s) => s.name));
  room.seats.forEach((s, i) => {
    if (s.type === 'empty') {
      const name = AI_NAMES.find((n) => !used.has('AI ' + n)) || 'AI';
      used.add('AI ' + name);
      room.seats[i] = { type: 'ai', name: 'AI ' + name, token: null, conn: 0, lastSeen: 0 };
    }
  });
}

// ---- 状態配信 -----------------------------------------------------------
function view(room, seat) {
  const g = room.g;
  const v = {
    room: room.code, phase: room.phase, you: seat, host: room.host, level: room.level, round: room.round, pub: room.pub, locked: !!room.password, size: room.seats.length, rules: room.rules,
    password: seat === room.host ? room.password : undefined,
    seats: room.seats.map((s, i) => ({ type: s.type, name: s.name, online: s.type === 'ai' || s.conn > 0, score: room.scores[i], wins: room.wins[i] || 0 })),
    titles: titlesFor(room.seats.length),
  };
  if (room.phase === 'game' && g) {
    const gv = {
      phase: g.phase, turn: g.turn, rev: g.rev, lock: g.lock, counts: g.hands.map((h) => h.length),
      passed: g.passedFlags, places: g.places, leader: g.leaderSeat, lastPlayer: g.lastPlayer,
      field: g.field ? { player: g.field.player, cards: g.field.it.view } : null,
      order: g.order, dir: g.dir, effRev: G.effRev(g), jb: g.jb, arthur: g.arthur, omen: g.omen, noRev: g.noRev, lockAny: g.lockAny, lockSeq: g.lockSeq, mustD3: g.mustD3,
      events: g.events.slice(-6), evSeq: g.evSeq, cut8: !!(g.field && g.field.cut8),
      hand: G.sortHand(g.hands[seat]).map((c) => G.cardView(c)),
      log: g.log.slice(-10),
    };
    if (g.phase === 'play' && g.turn === seat) gv.legal = G.legalKeys(g, seat);
    if (g.phase === 'exchange') {
      const mine = g.exchange.needs.find((n) => n.seat === seat);
      gv.exchange = {
        youNeed: mine ? mine.n : 0,
        received: mine ? mine.received : [],
        pending: g.exchange.needs.map((n) => n.seat),
        info: g.exchange.log,
      };
    }
    if (room.deadline) gv.timeLeft = Math.max(0, room.deadline - Date.now());
    if (g.phase === 'end') {
      gv.results = room.lastResults;
      gv.ready = [...room.ready];
      gv.waiting = waitingSeats(room);
      gv.canJoin = joinableSeat(room) != null;
    }
    v.game = gv;
  }
  return v;
}
// ---- チャット ----
const CHAT_MAX = 200;
function chatWrite(client, m) {
  try { client.res.write('event: chat\ndata: ' + JSON.stringify(m) + '\n\n'); } catch (e) { /* closed */ }
}
function addChat(room, seat, text, sys) {
  const m = { id: ++room.chatSeq, seat: sys ? -1 : seat, name: sys ? '' : room.seats[seat].name, text, sys: !!sys, t: Date.now() };
  room.chat.push(m);
  if (room.chat.length > 100) room.chat.shift();
  room.updated = Date.now();
  for (const c of room.clients) chatWrite(c, m);
}
function cleanChat(t) {
  return String(t == null ? '' : t).replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX);
}

function send(client, room) {
  try { client.res.write('data: ' + JSON.stringify(view(room, client.seat)) + '\n\n'); } catch (e) { /* closed */ }
}
function broadcast(room) {
  room.updated = Date.now();
  for (const c of room.clients) send(c, room);
}

// ---- 進行 ---------------------------------------------------------------
function startRound(room, prev) {
  room.g = G.newRound(prev, room.seats.length, room.rules, { maintained: room.maintained });
  room.round++;
  room.scored = false;
  room.ready = new Set();
  room.lastResults = null;
  room.phase = 'game';
  if (room.g.phase === 'end') { finishIfEnd(room); broadcast(room); return; }
  schedule(room);
}
function finishIfEnd(room) {
  const g = room.g;
  if (g.phase === 'end' && !room.scored) {
    room.scored = true;
    room.maintained = !!g.maintained;
    const n = room.seats.length;
    const titles = titlesFor(n);
    room.ready = new Set();
    if (g.places.length) room.wins[g.places[0]] = (room.wins[g.places[0]] || 0) + 1;
    room.lastResults = g.places.map((seat, p) => {
      const add = n - 1 - p;
      room.scores[seat] += add;
      return { seat, place: p, title: titles[p], add };
    });
  }
}
function afterMove(room) {
  finishIfEnd(room);
  broadcast(room);
  schedule(room);
}
function schedule(room) {
  clearTimeout(room.timer);
  room.deadline = null;
  const g = room.g;
  if (!g || room.phase !== 'game') return;
  if (g.phase === 'exchange') {
    for (const need of g.exchange.needs.slice()) if (isBot(room, need.seat)) G.autoGive(g, need.seat);
    broadcast(room);
    if (g.phase === 'exchange') {
      if (humans(room) >= 2) {
        room.deadline = Date.now() + TURN_MS;
        room.timer = setTimeout(() => {
          for (const need of g.exchange.needs.slice()) G.autoGive(g, need.seat);
          afterMove(room);
        }, TURN_MS);
      }
      return;
    }
  }
  if (g.phase === 'play') {
    const seat = g.turn;
    if (isBot(room, seat)) {
      room.timer = setTimeout(() => botMove(room, seat), AI_DELAY + Math.random() * AI_DELAY);
    } else if (humans(room) >= 2) {
      room.deadline = Date.now() + TURN_MS;
      room.timer = setTimeout(() => botMove(room, seat), TURN_MS);
    }
    broadcast(room);
  }
}
function botMove(room, seat) {
  const g = room.g;
  if (!g || g.phase !== 'play' || g.turn !== seat) return;
  const level = room.seats[seat].type === 'ai' ? room.level : 'normal';
  const act = G.aiChoose(g, seat, level);
  let r = act.type === 'pass' ? G.doPass(g, seat) : G.doPlay(g, seat, act.ids);
  if (!r.ok) {
    r = G.doPass(g, seat);
    if (!r.ok) {
      const c = G.sortHand(g.hands[seat])[0];
      r = G.doPlay(g, seat, [c.id]);
    }
  }
  afterMove(room);
}

// ---- 次のラウンド: 全員が「始める」を押すまで待つ ----
function waitingSeats(room) {
  const w = [];
  room.seats.forEach((s, i) => { if (s.type === 'human' && !isBot(room, i) && !room.ready.has(i)) w.push(i); });
  return w;
}
function checkReady(room) {
  const g = room.g;
  if (room.phase !== 'game' || !g || g.phase !== 'end') return false;
  if (waitingSeats(room).length > 0) return false;
  startRound(room, prevPlacesFor(room));
  broadcast(room);
  return true;
}
// 途中参加で席が増えた場合も、前回順位を全席ぶんに揃える
function prevPlacesFor(room) {
  const g = room.g;
  const n = room.seats.length;
  const prev = g.places.filter((x) => x < n);
  for (let i = 0; i < n; i++) if (!prev.includes(i)) prev.push(i);
  return prev;
}
// 結果画面での途中参加: 空席 → AI席の順に探す。なければ10人まで席を増やす
function joinableSeat(room) {
  if (room.phase === 'lobby') { const i = room.seats.findIndex((s) => s.type === 'empty'); return i < 0 ? null : i; }
  if (room.phase === 'game' && room.g && room.g.phase === 'end') {
    const e = room.seats.findIndex((s) => s.type === 'empty');
    if (e >= 0) return e;
    let best = -1;
    room.seats.forEach((s, i) => { if (s.type === 'ai' && (best < 0 || room.scores[i] < room.scores[best])) best = i; });
    if (best >= 0) return best;
    if (room.seats.length < MAX_PLAYERS) return room.seats.length;
  }
  return null;
}
function seatNewcomer(room, name) {
  let i = joinableSeat(room);
  if (i == null) return null;
  if (i >= room.seats.length) { room.seats.push(emptySeat()); room.scores.push(0); room.wins.push(0); }
  const token = seatHuman(room, i, name);
  if (room.phase === 'game') { room.scores[i] = 0; room.wins[i] = 0; room.ready.delete(i); }
  addChat(room, -1, room.seats[i].name + ' が参加しました', true);
  broadcast(room);
  return { token, seat: i };
}

function startGame(room) {
  fillAI(room);
  room.maintained = false;
  room.scores = Array(room.seats.length).fill(0);
  room.wins = Array(room.seats.length).fill(0);
  room.round = 0;
  startRound(room, null);
}
function toLobby(room) {
  clearTimeout(room.timer);
  room.deadline = null;
  room.phase = 'lobby';
  room.g = null;
  room.scores = Array(room.seats.length).fill(0);
  room.wins = Array(room.seats.length).fill(0);
  room.ready = new Set();
  room.round = 0;
  room.seats = room.seats.map((s) => (s.type === 'ai' ? emptySeat() : s));
  if (room.seats[room.host].type !== 'human') {
    const h = room.seats.findIndex((s) => s.type === 'human');
    if (h >= 0) room.host = h;
  }
}
function leaveSeat(room, seat) {
  const s = room.seats[seat];
  if (s.type === 'human') addChat(room, -1, s.name + ' が退出しました', true);
  for (const c of [...room.clients]) if (c.seat === seat) { try { c.res.end(); } catch (e) { /* ignore */ } room.clients.delete(c); }
  if (room.phase === 'lobby') {
    room.seats[seat] = emptySeat();
  } else {
    room.seats[seat] = { type: 'ai', name: s.name + '(代打)', token: null, conn: 0, lastSeen: 0 };
  }
  if (humans(room) === 0) {
    clearTimeout(room.timer);
    rooms.delete(room.code);
    return;
  }
  if (room.host === seat) room.host = room.seats.findIndex((x) => x.type === 'human');
  room.ready.delete(seat);
  if (room.phase === 'game') schedule(room);
  broadcast(room);
  checkReady(room);
}

// ---- HTTP ---------------------------------------------------------------
function readJson(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    req.on('data', (d) => { b += d; if (b.length > 20000) { reject(new Error('too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
async function handleApi(req, res, url) {
  const p = url.pathname;
  if (req.method === 'GET' && p === '/api/rules') {
    return json(res, 200, { rules: G.RULES, unsupported: G.UNSUPPORTED, defaults: G.DEFAULT_RULES });
  }
  if (req.method === 'GET' && p === '/api/rooms') {
    const list = [...rooms.values()]
      .filter((r) => r.pub && joinableSeat(r) != null)
      .map((r) => ({ code: r.code, host: r.seats[r.host].name, players: humans(r), size: r.seats.length, locked: !!r.password, status: r.phase === 'lobby' ? 'lobby' : 'between', round: r.round }));
    return json(res, 200, list);
  }
  if (req.method === 'GET' && p === '/api/events') {
    const room = getRoom(url.searchParams.get('room'));
    const token = url.searchParams.get('token');
    const seat = room ? seatByToken(room, token) : -1;
    if (!room || seat < 0) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive', 'X-Accel-Buffering': 'no',
    });
    res.write('retry: 2000\n\n');
    const client = { res, seat };
    room.clients.add(client);
    const s = room.seats[seat];
    s.conn++;
    s.lastSeen = Date.now();
    send(client, room);
    for (const m of room.chat.slice(-50)) chatWrite(client, m);
    broadcast(room);
    req.on('close', () => {
      room.clients.delete(client);
      const cur = room.seats[seat];
      if (cur && cur.token === token) { cur.conn = Math.max(0, cur.conn - 1); cur.lastSeen = Date.now(); }
      setTimeout(() => { if (rooms.has(room.code)) { broadcast(room); if (room.phase === 'game') schedule(room); checkReady(room); } }, 3500);
    });
    return;
  }
  if (req.method !== 'POST') return json(res, 404, { error: 'not found' });

  let body;
  try { body = await readJson(req); } catch (e) { return json(res, 400, { error: '不正なリクエスト' }); }

  if (p === '/api/create') {
    const online = body.mode === 'online';
    let custom = '';
    if (online && body.code) {
      custom = normCode(body.code);
      if (custom.length < 2) return json(res, 400, { error: '部屋名は2文字以上にしてください' });
      if (rooms.has(custom)) return json(res, 400, { error: 'その部屋名はすでに使われています' });
    }
    const { room, token } = createRoom(body.name, online && body.pub, body.level, body.size, online ? body.password : '', body.rules, custom);
    if (body.mode === 'ai') startGame(room);
    return json(res, 200, { room: room.code, token, seat: 0 });
  }
  if (p === '/api/join') {
    const room = getRoom(body.room);
    if (!room) return json(res, 404, { error: '部屋が見つかりません' });
    if (room.password && cleanPw(body.password) !== room.password) return json(res, 403, { error: 'パスワードが違います' });
    if (room.phase !== 'lobby' && !(room.g && room.g.phase === 'end')) return json(res, 400, { error: 'ゲーム中です。ラウンドの結果画面になると参加できます' });
    const r = seatNewcomer(room, body.name);
    if (!r) return json(res, 400, { error: '満席です' });
    return json(res, 200, { room: room.code, token: r.token, seat: r.seat });
  }
  if (p === '/api/quick') {
    const room = [...rooms.values()].find((r) => r.pub && !r.password && joinableSeat(r) != null);
    if (room) {
      const r = seatNewcomer(room, body.name);
      if (r) return json(res, 200, { room: room.code, token: r.token, seat: r.seat });
    }
    const made = createRoom(body.name, true, 'normal', 4, '');
    return json(res, 200, { room: made.room.code, token: made.token, seat: 0 });
  }
  if (p === '/api/action') {
    const room = getRoom(body.room);
    if (!room) return json(res, 404, { error: '部屋がありません' });
    const seat = seatByToken(room, body.token);
    if (seat < 0) return json(res, 403, { error: '認証エラー' });
    room.seats[seat].lastSeen = Date.now();
    const g = room.g;
    switch (body.type) {
      case 'level':
        if (seat !== room.host || room.phase !== 'lobby') return json(res, 403, { error: 'ホストのみ変更できます' });
        if (LEVELS.includes(body.level)) room.level = body.level;
        broadcast(room);
        return json(res, 200, { ok: true });
      case 'rules':
        if (seat !== room.host || room.phase !== 'lobby') return json(res, 403, { error: 'ホストのみ・ロビーでのみ変更できます' });
        room.rules = G.normRules(body.rules);
        broadcast(room);
        return json(res, 200, { ok: true });
      case 'chat': {
        const text = cleanChat(body.text);
        if (!text) return json(res, 400, { error: 'メッセージを入力してください' });
        const me = room.seats[seat];
        const now = Date.now();
        me.chatTimes = (me.chatTimes || []).filter((t) => now - t < 10000);
        if (me.chatTimes.length >= 8) return json(res, 429, { error: '送信が早すぎます。少し待ってください' });
        me.chatTimes.push(now);
        addChat(room, seat, text, false);
        return json(res, 200, { ok: true });
      }
      case 'password':
        if (seat !== room.host || room.phase !== 'lobby') return json(res, 403, { error: 'ホストのみ変更できます' });
        room.password = cleanPw(body.password);
        broadcast(room);
        return json(res, 200, { ok: true });
      case 'size': {
        if (seat !== room.host || room.phase !== 'lobby') return json(res, 403, { error: 'ホストのみ変更できます' });
        const n = clampSize(body.size);
        let maxUsed = -1;
        room.seats.forEach((s, i) => { if (s.type === 'human') maxUsed = i; });
        if (maxUsed >= n) return json(res, 400, { error: 'その人数には減らせません（参加者がいます）' });
        while (room.seats.length < n) room.seats.push(emptySeat());
        room.seats.length = n;
        room.scores = Array(n).fill(0);
        room.wins = Array(n).fill(0);
        broadcast(room);
        return json(res, 200, { ok: true });
      }
      case 'start':
        if (seat !== room.host) return json(res, 403, { error: 'ホストのみ開始できます' });
        if (room.phase !== 'lobby') return json(res, 400, { error: 'すでに開始しています' });
        startGame(room);
        return json(res, 200, { ok: true });
      case 'play': case 'pass': case 'give': {
        if (room.phase !== 'game' || !g) return json(res, 400, { error: 'ゲーム中ではありません' });
        let r;
        if (body.type === 'play') r = G.doPlay(g, seat, body.ids, { noRev: !!body.noRev });
        else if (body.type === 'pass') r = G.doPass(g, seat);
        else r = G.giveBack(g, seat, body.ids);
        if (!r.ok) return json(res, 400, { error: r.error });
        afterMove(room);
        return json(res, 200, { ok: true });
      }
      case 'next':
        if (room.phase !== 'game' || !g || g.phase !== 'end') return json(res, 400, { error: '結果表示中ではありません' });
        room.ready.add(seat);
        if (!checkReady(room)) broadcast(room);
        return json(res, 200, { ok: true });
      case 'lobby':
        if (seat !== room.host) return json(res, 403, { error: 'ホストのみ操作できます' });
        toLobby(room);
        broadcast(room);
        return json(res, 200, { ok: true });
      case 'leave':
        leaveSeat(room, seat);
        return json(res, 200, { ok: true });
      default:
        return json(res, 400, { error: '不明な操作' });
    }
  }
  return json(res, 404, { error: 'not found' });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/healthz') { res.writeHead(200); res.end('ok'); return; }
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch((e) => {
      console.error(e);
      if (!res.headersSent) json(res, 500, { error: 'サーバーエラー' });
    });
    return;
  }
  if (url.pathname === '/' || url.pathname === '/index.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }); res.end(INDEX_HTML); } else { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not found'); }
});

// SSEの切断防止(Renderのプロキシは無通信を切る)
setInterval(() => {
  for (const room of rooms.values()) for (const c of room.clients) { try { c.res.write(': hb\n\n'); } catch (e) { /* ignore */ } }
}, 15000);
// 古い部屋の掃除
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (room.clients.size === 0 && now - room.updated > 30 * 60 * 1000) {
      clearTimeout(room.timer);
      rooms.delete(code);
    }
  }
}, 60000);

server.listen(PORT, '0.0.0.0', () => console.log('大富豪サーバー起動 port ' + PORT));
