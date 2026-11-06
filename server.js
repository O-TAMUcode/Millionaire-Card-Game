'use strict';
// 大富豪オンライン 単一ファイル版: node server.js だけで動きます（依存パッケージなし）
const G = (function () {
const module = { exports: {} };
// 大富豪ゲームエンジン（サーバー側で権威的に判定）
// カード: {id, s:'S'|'H'|'D'|'C'|'X', r:3..15(14=A,15=2), 16=Joker}

const SUITS = ['S', 'H', 'D', 'C'];
const SYM = { S: '♠', H: '♥', D: '♦', C: '♣' };
const LABEL = { 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2', 16: 'JK' };
const isJ = (c) => c.r === 16;

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

// ---- 手の解釈 ----------------------------------------------------------
// 選んだカードを「同じ数字の組(set)」または「同スートの階段(stair)」として解釈する。
// ジョーカーはワイルド。階段でジョーカーの置き方が複数ある場合は複数の解釈を返す。
function interpretations(cards) {
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
  if (n >= 3 && nat.every((c) => c.s === nat[0].s) && new Set(nat.map((c) => c.r)).size === nat.length) {
    const ranks = nat.map((c) => c.r).sort((a, b) => a - b);
    const lo = ranks[0];
    const hi = ranks[ranks.length - 1];
    for (let start = Math.max(3, hi - n + 1); start <= Math.min(lo, 16 - n); start++) {
      const end = start + n - 1;
      const view = [];
      let ji = 0;
      for (let r = start; r <= end; r++) {
        const c = nat.find((x) => x.r === r);
        view.push(c ? cardView(c) : cardView(jokers[ji++], r));
      }
      res.push({ type: 'stair', n, start, end, suit: nat[0].s, cards, view });
    }
  }
  return res;
}

function strength(it, rev) {
  if (it.type === 'set') {
    if (it.rank === 16) return 100;
    return rev ? 18 - it.rank : it.rank;
  }
  return rev ? 18 - it.end : it.start;
}
function suitsOf(it) {
  return [...new Set(it.cards.filter((c) => !isJ(c)).map((c) => c.s))].sort();
}
const sameArr = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

function canPlay(it, field, rev, lock) {
  if (!field) return true;
  const f = field.it;
  // スペ3返し: 場がジョーカー単体のとき ♠3 単体で勝てる
  if (f.type === 'set' && f.rank === 16 && f.n === 1 && it.type === 'set' && it.n === 1 && it.cards[0].s === 'S' && it.cards[0].r === 3) return true;
  if (it.type !== f.type || it.n !== f.n) return false;
  if (lock && !it.cards.every((c) => isJ(c) || lock.includes(c.s))) return false;
  return strength(it, rev) > strength(f, rev);
}
const isEight = (it) => (it.type === 'set' && it.rank === 8) || (it.type === 'stair' && it.start <= 8 && it.end >= 8);
const isRevolution = (it) => (it.type === 'set' && it.n >= 4) || (it.type === 'stair' && it.n >= 5);

// ---- 候補生成（AIと「出せる手」表示用） ---------------------------------
function combos(arr, k) {
  const out = [];
  (function rec(i, cur) {
    if (cur.length === k) { out.push(cur.slice()); return; }
    for (let j = i; j < arr.length; j++) { cur.push(arr[j]); rec(j + 1, cur); cur.pop(); }
  })(0, []);
  return out;
}
function candidates(hand) {
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
  for (const s of SUITS) {
    const m = {};
    nat.filter((c) => c.s === s).forEach((c) => (m[c.r] = c));
    for (let st = 3; st <= 13; st++) {
      for (let en = st + 2; en <= 15; en++) {
        const cs = [];
        let miss = 0;
        for (let r = st; r <= en; r++) { if (m[r]) cs.push(m[r]); else miss++; }
        if (cs.length >= 1 && miss <= jokers.length) out.push(cs.concat(jokers.slice(0, miss)));
      }
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
  for (const cs of candidates(g.hands[seat])) {
    const its = interpretations(cs).filter((it) => canPlay(it, g.field, g.rev, g.lock));
    if (its.length) {
      its.sort((a, b) => strength(a, g.rev) - strength(b, g.rev));
      res.push(its[0]);
    }
  }
  return res;
}
function legalKeys(g, seat) {
  return legalPlays(g, seat).map((it) => it.cards.map((c) => c.id).sort((a, b) => a - b));
}

// ---- ラウンド進行 -------------------------------------------------------
function newRound(prevPlaces, n) {
  n = n || 4;
  const deck = shuffle(makeDeck());
  const hands = Array.from({ length: n }, () => []);
  deck.forEach((c, i) => hands[i % n].push(c));
  const g = {
    n, hands, turn: 0, field: null, lock: null, rev: false, passes: 0,
    passedFlags: Array(n).fill(false), lastPlayer: -1, places: [],
    phase: 'play', exchange: null, log: [], leaderSeat: 0,
  };
  if (prevPlaces && prevPlaces.length === n) {
    const p = prevPlaces;
    g.exchange = { needs: [], log: [] };
    const take = (from, to, k) => {
      const moved = g.hands[from].slice().sort((x, y) => y.r - x.r).slice(0, k);
      g.hands[from] = g.hands[from].filter((c) => !moved.includes(c));
      g.hands[to].push(...moved);
      g.exchange.needs.push({ seat: to, n: k, to: from, received: moved.map((c) => c.id) });
      g.exchange.log.push({ from, to, n: k });
    };
    take(p[n - 1], p[0], 2);
    if (n >= 4) take(p[n - 2], p[1], 1);
    g.phase = 'exchange';
    g.leaderSeat = p[0];
    g.turn = p[0];
  } else {
    g.turn = g.hands.findIndex((h) => h.some((c) => c.s === 'D' && c.r === 3));
    g.leaderSeat = g.turn;
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
  if (g.exchange.needs.length === 0) { g.phase = 'play'; g.turn = g.leaderSeat; }
  return { ok: true };
}
function autoGive(g, seat) {
  const need = g.exchange && g.exchange.needs.find((n) => n.seat === seat);
  if (!need) return;
  const ids = g.hands[seat].slice().sort((a, b) => a.r - b.r).slice(0, need.n).map((c) => c.id);
  giveBack(g, seat, ids);
}

const seatsOf = (g) => Array.from({ length: g.n }, (_, i) => i);
const err = (e) => ({ ok: false, error: e });
function nextActive(g, seat) {
  for (let k = 1; k <= g.n; k++) {
    const i = (seat + k) % g.n;
    if (g.hands[i].length > 0) return i;
  }
  return seat;
}
function pushLog(g, s, t) {
  g.log.push({ s, t });
  if (g.log.length > 40) g.log.shift();
}
function itText(it) {
  return it.view
    .map((c) => (isJ(c) ? 'JK' + (c.as ? '(' + LABEL[c.as] + ')' : '') : SYM[c.s] + LABEL[c.r]))
    .join(' ');
}
function clearField(g) {
  g.field = null;
  g.lock = null;
  g.passes = 0;
  g.passedFlags = Array(g.n).fill(false);
}

function doPlay(g, seat, ids) {
  if (g.phase !== 'play') return err('今はカードを出せません');
  if (g.turn !== seat) return err('あなたの番ではありません');
  if (!Array.isArray(ids) || !ids.length) return err('カードを選んでください');
  const cards = [];
  const seen = new Set();
  for (const id of ids) {
    const c = g.hands[seat].find((x) => x.id === id);
    if (!c || seen.has(id)) return err('不正なカードです');
    seen.add(id);
    cards.push(c);
  }
  const its = interpretations(cards);
  if (!its.length) return err('その組み合わせは出せません');
  const ok = its.filter((it) => canPlay(it, g.field, g.rev, g.lock));
  if (!ok.length) return err('そのカードは場に出せません（枚数・強さ・縛りを確認）');
  ok.sort((a, b) => strength(a, g.rev) - strength(b, g.rev));
  const it = ok[0];

  g.hands[seat] = g.hands[seat].filter((c) => !seen.has(c.id));
  if (g.field && !g.lock) {
    const ps = suitsOf(it);
    if (ps.length && sameArr(ps, suitsOf(g.field.it))) {
      g.lock = ps;
      pushLog(g, -1, '縛り！ ' + ps.map((s) => SYM[s]).join(''));
    }
  }
  g.field = { it, player: seat };
  g.lastPlayer = seat;
  g.passes = 0;
  g.passedFlags = Array(g.n).fill(false);
  pushLog(g, seat, itText(it));

  if (isRevolution(it)) {
    g.rev = !g.rev;
    pushLog(g, -1, g.rev ? '革命！ 強さが逆転' : '革命返し！ 強さが元に戻る');
  }
  const out = g.hands[seat].length === 0;
  if (out) {
    g.places.push(seat);
    pushLog(g, seat, '上がり！');
    const remaining = g.hands.map((_, i) => i).filter((i) => g.hands[i].length > 0);
    if (remaining.length <= 1) {
      if (remaining.length === 1) g.places.push(remaining[0]);
      g.phase = 'end';
      return { ok: true };
    }
  }
  if (isEight(it)) {
    pushLog(g, -1, '8切り！ 場が流れる');
    clearField(g);
    g.turn = out ? nextActive(g, seat) : seat;
    return { ok: true };
  }
  g.turn = nextActive(g, seat);
  return { ok: true };
}

function doPass(g, seat) {
  if (g.phase !== 'play') return err('今はパスできません');
  if (g.turn !== seat) return err('あなたの番ではありません');
  if (!g.field) return err('最初の手番はパスできません');
  g.passes++;
  g.passedFlags[seat] = true;
  pushLog(g, seat, 'パス');
  const others = g.hands.map((_, i) => i).filter((i) => g.hands[i].length > 0 && i !== g.lastPlayer);
  if (g.passes >= others.length) {
    const leader = g.hands[g.lastPlayer].length > 0 ? g.lastPlayer : nextActive(g, g.lastPlayer);
    clearField(g);
    pushLog(g, -1, '場が流れました');
    g.turn = leader;
  } else {
    g.turn = nextActive(g, seat);
  }
  return { ok: true };
}

// ---- AI -----------------------------------------------------------------
function handAvg(cards, rev) {
  if (!cards.length) return 0;
  let t = 0;
  for (const c of cards) t += isJ(c) ? 20 : rev ? 18 - c.r : c.r;
  return t / cards.length;
}
function costOf(g, seat, it, leading, level) {
  const ids = new Set(it.cards.map((c) => c.id));
  const remaining = g.hands[seat].filter((c) => !ids.has(c.id));
  if (remaining.length === 0) return -1000;
  const s = strength(it, g.rev);
  let cost = s >= 100 ? 30 : s;
  cost += it.cards.filter(isJ).length * 5;
  cost -= it.n * 1.2;
  if (isEight(it) && !leading) cost -= 2;
  if (isRevolution(it)) {
    const now = handAvg(remaining, g.rev);
    const flipped = handAvg(remaining, !g.rev);
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
  if (level === 'easy') {
    if (!leading && Math.random() < 0.2) return { type: 'pass' };
    const top = scored.slice(0, Math.min(4, scored.length));
    return play(top[Math.floor(Math.random() * top.length)]);
  }
  const best = scored[0];
  if (!leading && best.cost > -500) {
    const s = strength(best.it, g.rev);
    const saveLimit = level === 'hard' ? 13 : 15;
    const oppLimit = level === 'hard' ? 3 : 5;
    if (s >= saveLimit && oppMin > oppLimit && hand.length > best.it.n + 2) return { type: 'pass' };
  }
  return play(best);
}

module.exports = {
  SUITS, SYM, LABEL, makeDeck, shuffle, sortHand, cardView, interpretations, strength, canPlay,
  legalKeys, legalPlays, newRound, giveBack, autoGive, doPlay, doPass, aiChoose, nextActive,
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
:root{--bg:#0f3b2c;--bg2:#0a2a1f;--card:#fffdf6;--ink:#1d1d1f;--red:#c62828;--gold:#f4c542;--cw:56px;--ch:80px;--ov:-24px}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;height:100%;background:var(--bg2);color:#fff;font-family:"Hiragino Sans","Yu Gothic",Meiryo,system-ui,sans-serif}
button{font:inherit;cursor:pointer;border:0;border-radius:10px;padding:10px 16px;font-weight:700;background:var(--gold);color:#3a2a00}
button.sub{background:#ffffff22;color:#fff}
button:disabled{opacity:.35;cursor:not-allowed}
input,select{font:inherit;padding:10px 12px;border-radius:10px;border:1px solid #ffffff44;background:#00000040;color:#fff;min-width:0}
select option{color:#000}
.screen{display:none;min-height:100%;padding:16px;max-width:760px;margin:0 auto}
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
#toast{position:fixed;left:50%;top:14px;transform:translateX(-50%);background:#000c;padding:10px 16px;border-radius:12px;z-index:50;display:none;max-width:90%}
/* ゲーム */
#game{padding:0;max-width:none;height:100vh;height:100dvh;overflow:hidden;background:radial-gradient(ellipse at center,var(--bg) 0%,var(--bg2) 100%)}
#game.on{display:flex;flex-direction:column}
.top{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;font-size:13px;gap:8px}
.chips{display:flex;gap:6px;flex-wrap:wrap}
.chip{background:#ffffff1f;border-radius:99px;padding:3px 10px;font-size:12px}
.chip.hot{background:var(--gold);color:#3a2a00;font-weight:800}
.table{flex:1;display:grid;grid-template-columns:1fr 2fr 1fr;grid-template-rows:auto 1fr;gap:4px;padding:0 8px;min-height:0}
.opp{background:#00000028;border-radius:14px;padding:8px;text-align:center;font-size:12px;border:2px solid transparent;position:relative}
.opp.turn{border-color:var(--gold);box-shadow:0 0 14px #f4c54288}
.opp .nm{font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.opp .ttl{font-size:11px;color:var(--gold)}
.opp .cnt{font-size:22px;font-weight:800}
.opp .pass{position:absolute;right:6px;top:6px;background:#fff;color:#333;border-radius:8px;padding:1px 6px;font-size:11px}
.opp .off{opacity:.5}
.fan{display:flex;justify-content:center;margin-top:2px;height:18px}
.fan i{display:block;width:10px;height:18px;border-radius:2px;background:linear-gradient(135deg,#3b5bdb,#1c3aa9);border:1px solid #fff8;margin-left:-5px}
.opps{display:flex;flex-wrap:wrap;gap:4px;justify-content:center;padding:0 6px}
.opps .opp{flex:1 1 84px;max-width:128px;padding:5px}
.opps .opp .cnt{font-size:18px}
.center{flex:1}
.opp.l{grid-column:1;grid-row:2;align-self:center}
.opp.t{grid-column:2;grid-row:1}
.opp.r{grid-column:3;grid-row:2;align-self:center}
.center{grid-column:2;grid-row:2;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:0}
.field{display:flex;gap:4px;justify-content:center;flex-wrap:wrap;min-height:calc(var(--ch)*.8)}
.field .card{--cw:46px;--ch:66px;font-size:.85em}
.fieldwho{font-size:12px;opacity:.8;min-height:16px}
.log{font-size:11px;opacity:.8;text-align:center;line-height:1.5;max-height:5.5em;overflow:hidden}
.me{padding:6px 8px calc(8px + env(safe-area-inset-bottom));background:#0006}
.meinfo{display:flex;justify-content:space-between;align-items:center;font-size:13px;margin-bottom:4px;gap:6px}
.meinfo.turn .nm{color:var(--gold);font-weight:800}
.hand{display:flex;justify-content:center;padding-top:16px;min-height:calc(var(--ch) + 22px);overflow-x:auto}
.hand .card{margin-left:var(--ov);cursor:pointer;transition:transform .12s}
.hand .card:first-child{margin-left:0}
.hand .card.sel{transform:translateY(-14px);box-shadow:0 0 0 3px var(--gold),0 6px 12px #0008}
.hand .card.dim{filter:brightness(.55)}
.btns{display:flex;gap:8px;justify-content:center;margin-top:6px;flex-wrap:wrap}
.card{width:var(--cw);height:var(--ch);flex:none;background:var(--card);color:var(--ink);border-radius:8px;border:1px solid #0004;position:relative;box-shadow:0 2px 5px #0006;user-select:none;font-weight:800}
.card.red{color:var(--red)}
.card .rk{position:absolute;left:5px;top:3px;font-size:1.05em;line-height:1}
.card .su{position:absolute;left:0;right:0;top:50%;transform:translateY(-35%);text-align:center;font-size:1.7em;line-height:1}
.card.joker{background:linear-gradient(160deg,#fff,#ffe9f5);color:#7b1fa2}
.card.joker .su{font-size:1em;writing-mode:vertical-rl;letter-spacing:2px;top:50%;transform:translateY(-50%);left:50%;right:auto;margin-left:-.6em}
.card .as{position:absolute;right:3px;bottom:2px;font-size:.7em;background:#7b1fa2;color:#fff;border-radius:4px;padding:0 3px}
.modal{position:fixed;inset:0;background:#000b;display:none;align-items:center;justify-content:center;z-index:30;padding:16px}
.modal.on{display:flex}
.modal .box{background:#17382c;border:1px solid #ffffff30;border-radius:18px;padding:18px;max-width:440px;width:100%;max-height:90vh;overflow:auto}
.res{display:flex;justify-content:space-between;padding:8px 10px;border-radius:8px;background:#ffffff14;margin:5px 0}
.res.me{outline:2px solid var(--gold)}
.timer{font-variant-numeric:tabular-nums;color:var(--gold);font-weight:800}
.hint{text-align:center;font-size:13px;color:var(--gold);min-height:18px}
ul.rules{padding-left:18px;line-height:1.7;font-size:14px}
@media (max-width:600px){:root{--cw:42px;--ch:60px;--ov:-24px}.opp{padding:5px}.opp .cnt{font-size:18px}.table{grid-template-columns:1fr 1.6fr 1fr}.field .card{--cw:38px;--ch:54px}}
</style>
</head>
<body>
<div id="toast"></div>

<!-- ホーム -->
<section class="screen" id="home">
  <h1>🃏 大富豪オンライン</h1>
  <div class="sub-title">AIと対戦 / 友達とオンライン対戦</div>
  <div class="panel">
    <h2>プレイヤー名</h2>
    <input id="name" maxlength="12" placeholder="なまえ" style="width:100%">
  </div>
  <div class="panel">
    <h2>AIと対戦（1人で遊ぶ）</h2>
    <div class="row">
      <select id="aiLevel"><option value="easy">よわい</option><option value="normal" selected>ふつう</option><option value="hard">つよい</option></select>
      <label>人数（自分を含む） <select id="aiSize"></select></label>
      <button onclick="startAI()">対戦スタート</button>
    </div>
  </div>
  <div class="panel">
    <h2>オンライン対戦</h2>
    <div class="row" style="margin-bottom:10px"><label>人数（最大10人） <select id="olSize"></select></label><input id="olPw" maxlength="20" placeholder="パスワード（任意・自由に設定）"></div>
    <div class="row" style="margin-bottom:10px">
      <button onclick="quick()">クイックマッチ</button>
      <button class="sub" onclick="createOnline(false)">部屋を作る（合言葉制）</button>
      <button class="sub" onclick="createOnline(true)">公開部屋を作る</button>
    </div>
    <div class="row">
      <input id="joinCode" maxlength="4" placeholder="部屋コード(4文字)" style="text-transform:uppercase">
      <input id="joinPw" maxlength="20" placeholder="パスワード（あれば）">
      <button onclick="joinRoom()">参加</button>
    </div>
    <div style="font-size:12px;opacity:.7;margin-top:8px">空席はホストが開始するとAIが埋めます。クイックマッチはパスワードなしの公開部屋に入ります。</div>
  </div>
  <div class="row" style="justify-content:center"><button class="sub" onclick="showRules()">ルール</button></div>
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
  <div id="lbWait" class="hint" style="display:none">ホストの開始を待っています…</div>
  <div id="lbInfo" class="hint"></div>
  <div class="row" style="justify-content:center"><button class="sub" onclick="leave()">退出</button></div>
</section>

<!-- ゲーム -->
<section class="screen" id="game">
  <div class="top">
    <div class="chips" id="chips"></div>
    <div class="row"><span class="timer" id="timer"></span><button class="sub" style="padding:4px 10px" onclick="showRules()">ルール</button><button class="sub" style="padding:4px 10px" onclick="leave(true)">退出</button></div>
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

<div class="modal" id="resModal"><div class="box" id="resBox"></div></div>
<div class="modal" id="rulesModal" onclick="this.classList.remove('on')"><div class="box" onclick="event.stopPropagation()">
  <h2 style="margin-top:0">ルール</h2>
  <ul class="rules">
    <li>強さ: 3 &lt; 4 … &lt; K &lt; A &lt; 2 &lt; ジョーカー（ジョーカーは2枚・ワイルド）</li>
    <li>場と同じ枚数で、より強い札を出す。同じ数字の組（ペア等）と、同じスートの階段（3枚以上連続）が出せます。</li>
    <li><b>8切り</b>: 8を出すと場が流れ、同じ人がもう一度出す。</li>
    <li><b>革命</b>: 同じ数字を4枚以上、または階段5枚以上で強さが逆転（もう一度で戻る）。</li>
    <li><b>縛り</b>: 連続して同じスートが出ると、そのスートしか出せなくなる。</li>
    <li><b>スペ3返し</b>: ジョーカー単体には♠3単体で勝てる。</li>
    <li>全員がパスすると場が流れる。早く上がるほど高得点（人数−1点〜0点）。3〜10人で遊べ、足りない席はAIが入ります。</li>
    <li>2ラウンド目以降は大貧民→大富豪に強い2枚（4人以上なら貧民→富豪に強い1枚も）を渡し、大富豪/富豪は好きな札を返す。</li>
    <li>オンラインでは1手45秒。時間切れ・切断時はAIが代打します。</li>
  </ul>
  <button onclick="document.getElementById('rulesModal').classList.remove('on')">閉じる</button>
</div></div>

<script>
const $ = (s) => document.querySelector(s);
const SYM = {S:'♠',H:'♥',D:'♦',C:'♣'};
const LABEL = {3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A',15:'2',16:'JK'};
let sess = null, S = null, es = null, sel = new Set(), deadlineAt = 0;
try { sess = JSON.parse(sessionStorage.getItem('dfg') || 'null'); } catch (e) {}

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => t.style.display = 'none', 2600); }
function screen(id) { document.querySelectorAll('.screen').forEach((e) => e.classList.toggle('on', e.id === id)); }
async function api(path, body) {
  try {
    const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) { toast(j.error || 'エラー'); return null; }
    return j;
  } catch (e) { toast('通信エラー'); return null; }
}
const myName = () => { const n = $('#name').value.trim() || 'ゲスト'; localStorage.setItem('dfgName', n); return n; };
function enter(j) { sess = { room: j.room, token: j.token }; sessionStorage.setItem('dfg', JSON.stringify(sess)); history.replaceState(null, '', '?room=' + j.room); connect(); }
async function startAI() { const j = await api('/api/create', { name: myName(), mode: 'ai', level: $('#aiLevel').value, size: +$('#aiSize').value }); if (j) enter(j); }
async function createOnline(pub) { const j = await api('/api/create', { name: myName(), mode: 'online', pub, size: +$('#olSize').value, password: $('#olPw').value }); if (j) enter(j); }
async function quick() { const j = await api('/api/quick', { name: myName() }); if (j) enter(j); }
async function joinRoom() { const j = await api('/api/join', { name: myName(), room: $('#joinCode').value.trim().toUpperCase(), password: $('#joinPw').value }); if (j) enter(j); }
function act(type, extra) { if (!sess) return Promise.resolve(null); return api('/api/action', Object.assign({ room: sess.room, token: sess.token, type }, extra || {})); }
async function leave(confirmFirst) {
  if (confirmFirst && !confirm('退出しますか？（AIが代わりに続けます）')) return;
  await act('leave');
  reset();
}
function reset() {
  if (es) es.close(); es = null; S = null; sess = null; sel.clear();
  sessionStorage.removeItem('dfg'); history.replaceState(null, '', location.pathname);
  $('#resModal').classList.remove('on'); screen('home');
}
function copyLink() {
  const url = location.origin + '/?room=' + S.room;
  (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast('コピーしました'), () => prompt('招待リンク', url));
}
function setPw() { act('password', { password: $('#lbPw').value }).then((r) => r && toast($('#lbPw').value ? 'パスワードを設定しました' : 'パスワードを解除しました')); }
function showRules() { $('#rulesModal').classList.add('on'); }

function connect() {
  if (es) es.close();
  es = new EventSource('/api/events?room=' + sess.room + '&token=' + sess.token);
  es.onmessage = (e) => { S = JSON.parse(e.data); if (S.game && S.game.timeLeft != null) deadlineAt = Date.now() + S.game.timeLeft; else deadlineAt = 0; render(); };
  es.onerror = () => { if (es.readyState === 2) { toast('部屋に接続できませんでした'); reset(); } };
}

function cardEl(c, cls) {
  const d = document.createElement('div');
  const joker = c.r === 16;
  d.className = 'card' + (joker ? ' joker' : '') + (c.s === 'H' || c.s === 'D' ? ' red' : '') + (cls ? ' ' + cls : '');
  if (joker) {
    d.innerHTML = '<span class="rk">★</span><span class="su">JOKER</span>' + (c.as ? '<span class="as">' + LABEL[c.as] + '</span>' : '');
  } else {
    d.innerHTML = '<span class="rk">' + LABEL[c.r] + '</span><span class="su">' + SYM[c.s] + '</span>';
  }
  return d;
}
const key = (ids) => ids.slice().sort((a, b) => a - b).join(',');

function render() {
  if (!S) return;
  if (S.phase === 'lobby') { $('#resModal').classList.remove('on'); renderLobby(); screen('lobby'); }
  else { renderGame(); screen('game'); }
}
function renderLobby() {
  $('#lbCode').textContent = S.room;
  $('#lbSeats').innerHTML = S.seats.map((s, i) => '<div class="seat"><span>' + (s.type === 'empty' ? '<span style="opacity:.5">空席（AIが入ります）</span>' : esc(s.name)) + (i === S.you ? ' <span class="tag">（あなた）</span>' : '') + (i === S.host ? ' <span class="tag">👑ホスト</span>' : '') + '</span><span class="tag">' + (s.type === 'human' ? (s.online ? '● オンライン' : '○ 切断中') : '') + '</span></div>').join('');
  const host = S.you === S.host;
  $('#lbHostPanel').style.display = host ? '' : 'none';
  $('#lbWait').style.display = host ? 'none' : '';
  $('#lbLevel').value = S.level;
  $('#lbSize').value = S.size;
  const pw = $('#lbPw');
  if (document.activeElement !== pw) pw.value = S.password || '';
  const humansN = S.seats.filter((x) => x.type === 'human').length;
  $('#lbInfo').textContent = S.size + '人で開始（参加' + humansN + '人 + AI' + (S.size - humansN) + '人）' + (S.locked ? ' 🔒パスワードあり' : '');
}
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function renderGame() {
  const g = S.game, you = S.you, n = S.seats.length;
  const legalKeys = new Set((g.legal || []).map(key));
  const legalIds = new Set((g.legal || []).flat());
  const myTurn = g.phase === 'play' && g.turn === you;
  // チップ
  const chips = ['<span class="chip">ROUND ' + S.round + '</span>'];
  if (g.rev) chips.push('<span class="chip hot">革命中</span>');
  if (g.lock) chips.push('<span class="chip hot">縛り ' + g.lock.map((s) => SYM[s]).join('') + '</span>');
  $('#chips').innerHTML = chips.join('');
  // 相手
  const place = (seat) => { const p = g.places.indexOf(seat); return p >= 0 ? S.titles[p] || '' : (g.phase === 'end' ? '' : ''); };
  const oppEl = $('#opps');
  oppEl.innerHTML = '';
  for (let rel = 1; rel < n; rel++) {
    const i = (you + rel) % n, st = S.seats[i];
    const el = document.createElement('div');
    el.className = 'opp' + (g.phase === 'play' && g.turn === i ? ' turn' : '');
    const cnt = g.counts[i];
    el.innerHTML = (g.passed[i] ? '<span class="pass">パス</span>' : '') +
      '<div class="nm ' + (st.online ? '' : 'off') + '">' + esc(st.name) + '</div>' +
      '<div class="ttl">' + (g.places.includes(i) ? '🏁' + (g.places.indexOf(i) + 1) + '位' : '&nbsp;') + '</div>' +
      '<div class="cnt">' + cnt + '<span style="font-size:11px;font-weight:400">枚</span></div>' +
      '<div style="font-size:11px;opacity:.7">' + st.score + '点</div>';
    oppEl.appendChild(el);
  }
  // 場
  const f = $('#field'); f.innerHTML = '';
  if (g.field) { g.field.cards.forEach((c) => f.appendChild(cardEl(c))); $('#fieldWho').textContent = S.seats[g.field.player].name + ' の手'; }
  else $('#fieldWho').textContent = g.phase === 'play' ? '場は空です（好きな札から）' : '';
  $('#log').innerHTML = g.log.slice(-5).map((l) => '<div>' + (l.s >= 0 ? esc(S.seats[l.s].name) + ': ' : '') + esc(l.t) + '</div>').join('');
  // 自分
  const meTurn = (myTurn || (g.phase === 'exchange' && g.exchange.youNeed > 0));
  $('#meinfo').className = 'meinfo' + (meTurn ? ' turn' : '');
  $('#meinfo').innerHTML = '<span class="nm">' + esc(S.seats[you].name) + (g.places.includes(you) ? '　🏁' + (g.places.indexOf(you) + 1) + '位で上がり' : '') + '</span><span>' + S.seats[you].score + '点</span>';
  // 手札
  const hand = $('#hand'); hand.innerHTML = '';
  const ids = new Set(g.hand.map((c) => c.id));
  for (const id of [...sel]) if (!ids.has(id)) sel.delete(id);
  const recv = new Set(g.exchange ? g.exchange.received : []);
  g.hand.forEach((c) => {
    let cls = '';
    if (sel.has(c.id)) cls += ' sel';
    if (myTurn && !legalIds.has(c.id)) cls += ' dim';
    const el = cardEl(c, cls.trim());
    if (recv.has(c.id)) el.style.outline = '2px dashed #6cf';
    el.onclick = () => { if (sel.has(c.id)) sel.delete(c.id); else sel.add(c.id); renderGame(); };
    hand.appendChild(el);
  });
  // ボタン・ヒント
  const btns = $('#btns'); btns.innerHTML = '';
  const hint = $('#hint');
  const selIds = [...sel];
  if (g.phase === 'exchange') {
    const need = g.exchange.youNeed;
    if (need > 0) {
      hint.textContent = '交換: 相手に渡すカードを ' + need + ' 枚選んでください（点線は受け取った札）';
      btns.innerHTML = '<button id="giveBtn" ' + (selIds.length === need ? '' : 'disabled') + '>渡す</button>';
      $('#giveBtn').onclick = async () => { const r = await act('give', { ids: selIds }); if (r) sel.clear(); };
    } else hint.textContent = 'カード交換中…';
  } else if (g.phase === 'play') {
    if (myTurn) {
      const canPlay = legalKeys.has(key(selIds));
      const noMove = g.legal.length === 0;
      hint.textContent = noMove ? '出せるカードがありません。パスしてください' : (g.field ? '場より強い札を選んで「出す」' : 'あなたが先攻です。好きな札を選んで「出す」');
      btns.innerHTML = '<button id="playBtn" ' + (canPlay ? '' : 'disabled') + '>出す</button>' +
        '<button id="passBtn" class="sub" ' + (g.field ? '' : 'disabled') + '>パス</button>' +
        '<button id="clrBtn" class="sub" ' + (selIds.length ? '' : 'disabled') + '>選択解除</button>';
      $('#playBtn').onclick = async () => { const r = await act('play', { ids: selIds }); if (r) sel.clear(); };
      $('#passBtn').onclick = () => act('pass');
      $('#clrBtn').onclick = () => { sel.clear(); renderGame(); };
    } else if (g.places.includes(you)) hint.textContent = '上がりました！ 他のプレイヤーを待っています';
    else hint.textContent = S.seats[g.turn].name + ' の番です';
  } else hint.textContent = '';
  // 結果
  const modal = $('#resModal');
  if (g.phase === 'end' && g.results) {
    const rows = g.results.map((r) => '<div class="res' + (r.seat === you ? ' me' : '') + '"><span>' + (r.place + 1) + '位 ' + r.title + '　' + esc(S.seats[r.seat].name) + '</span><span>+' + r.add + '点（計' + S.seats[r.seat].score + '）</span></div>').join('');
    $('#resBox').innerHTML = '<h2 style="margin-top:0">ラウンド ' + S.round + ' 結果</h2>' + rows +
      '<div class="row" style="margin-top:12px"><button onclick="act(\\'next\\')">次のラウンドへ</button>' +
      (S.you === S.host ? '<button class="sub" onclick="act(\\'lobby\\')">ロビーに戻る</button>' : '') +
      '<button class="sub" onclick="leave()">退出</button></div>';
    modal.classList.add('on');
  } else modal.classList.remove('on');
}
setInterval(() => {
  const t = $('#timer');
  if (!t) return;
  if (deadlineAt && S && S.game) { const s = Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000)); t.textContent = '⏱ ' + s + 's'; }
  else t.textContent = '';
}, 250);

// 起動
(function init() {
  for (const [id, def] of [['aiSize', 4], ['olSize', 4], ['lbSize', 4]]) {
    const el = document.getElementById(id);
    for (let k = 3; k <= 10; k++) el.add(new Option(k + '人', k));
    el.value = def;
  }
  $('#name').value = localStorage.getItem('dfgName') || '';
  const q = new URLSearchParams(location.search).get('room');
  if (sess && (!q || q.toUpperCase() === sess.room)) { screen('home'); connect(); return; }
  if (q) $('#joinCode').value = q.toUpperCase();
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
const cleanPw = (p) => String(p || '').slice(0, 20);
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

function createRoom(name, pub, level, size, password) {
  size = clampSize(size);
  const code = newCode();
  const room = {
    code, pub: !!pub, password: cleanPw(password), phase: 'lobby', host: 0, level: LEVELS.includes(level) ? level : 'normal',
    seats: Array.from({ length: size }, emptySeat), scores: Array(size).fill(0), round: 0,
    g: null, clients: new Set(), timer: null, deadline: null, lastResults: null, scored: false,
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
    room: room.code, phase: room.phase, you: seat, host: room.host, level: room.level, round: room.round, pub: room.pub, locked: !!room.password, size: room.seats.length,
    password: seat === room.host ? room.password : undefined,
    seats: room.seats.map((s, i) => ({ type: s.type, name: s.name, online: s.type === 'ai' || s.conn > 0, score: room.scores[i] })),
    titles: titlesFor(room.seats.length),
  };
  if (room.phase === 'game' && g) {
    const gv = {
      phase: g.phase, turn: g.turn, rev: g.rev, lock: g.lock, counts: g.hands.map((h) => h.length),
      passed: g.passedFlags, places: g.places, leader: g.leaderSeat, lastPlayer: g.lastPlayer,
      field: g.field ? { player: g.field.player, cards: g.field.it.view } : null,
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
    if (g.phase === 'end') gv.results = room.lastResults;
    v.game = gv;
  }
  return v;
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
  room.g = G.newRound(prev, room.seats.length);
  room.round++;
  room.scored = false;
  room.lastResults = null;
  room.phase = 'game';
  schedule(room);
}
function finishIfEnd(room) {
  const g = room.g;
  if (g.phase === 'end' && !room.scored) {
    room.scored = true;
    const n = room.seats.length;
    const titles = titlesFor(n);
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

function startGame(room) {
  fillAI(room);
  room.scores = Array(room.seats.length).fill(0);
  room.round = 0;
  startRound(room, null);
}
function toLobby(room) {
  clearTimeout(room.timer);
  room.deadline = null;
  room.phase = 'lobby';
  room.g = null;
  room.scores = Array(room.seats.length).fill(0);
  room.round = 0;
  room.seats = room.seats.map((s) => (s.type === 'ai' ? emptySeat() : s));
  if (room.seats[room.host].type !== 'human') {
    const h = room.seats.findIndex((s) => s.type === 'human');
    if (h >= 0) room.host = h;
  }
}
function leaveSeat(room, seat) {
  const s = room.seats[seat];
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
  if (room.phase === 'game') schedule(room);
  broadcast(room);
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
  if (req.method === 'GET' && p === '/api/rooms') {
    const list = [...rooms.values()]
      .filter((r) => r.pub && r.phase === 'lobby' && r.seats.some((s) => s.type === 'empty'))
      .map((r) => ({ code: r.code, host: r.seats[r.host].name, players: humans(r), size: r.seats.length, locked: !!r.password }));
    return json(res, 200, list);
  }
  if (req.method === 'GET' && p === '/api/events') {
    const room = rooms.get(String(url.searchParams.get('room') || '').toUpperCase());
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
    broadcast(room);
    req.on('close', () => {
      room.clients.delete(client);
      const cur = room.seats[seat];
      if (cur && cur.token === token) { cur.conn = Math.max(0, cur.conn - 1); cur.lastSeen = Date.now(); }
      setTimeout(() => { if (rooms.has(room.code)) { broadcast(room); if (room.phase === 'game') schedule(room); } }, 3500);
    });
    return;
  }
  if (req.method !== 'POST') return json(res, 404, { error: 'not found' });

  let body;
  try { body = await readJson(req); } catch (e) { return json(res, 400, { error: '不正なリクエスト' }); }

  if (p === '/api/create') {
    const online = body.mode === 'online';
    const { room, token } = createRoom(body.name, online && body.pub, body.level, body.size, online ? body.password : '');
    if (body.mode === 'ai') startGame(room);
    return json(res, 200, { room: room.code, token, seat: 0 });
  }
  if (p === '/api/join') {
    const room = rooms.get(String(body.room || '').toUpperCase());
    if (!room) return json(res, 404, { error: '部屋が見つかりません' });
    if (room.phase !== 'lobby') return json(res, 400, { error: 'この部屋はすでにゲーム中です' });
    if (room.password && cleanPw(body.password) !== room.password) return json(res, 403, { error: 'パスワードが違います' });
    const i = room.seats.findIndex((s) => s.type === 'empty');
    if (i < 0) return json(res, 400, { error: '満席です' });
    const token = seatHuman(room, i, body.name);
    broadcast(room);
    return json(res, 200, { room: room.code, token, seat: i });
  }
  if (p === '/api/quick') {
    let room = [...rooms.values()].find((r) => r.pub && !r.password && r.phase === 'lobby' && r.seats.some((s) => s.type === 'empty'));
    if (room) {
      const i = room.seats.findIndex((s) => s.type === 'empty');
      const token = seatHuman(room, i, body.name);
      broadcast(room);
      return json(res, 200, { room: room.code, token, seat: i });
    }
    const made = createRoom(body.name, true, 'normal', 4, '');
    return json(res, 200, { room: made.room.code, token: made.token, seat: 0 });
  }
  if (p === '/api/action') {
    const room = rooms.get(String(body.room || '').toUpperCase());
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
        if (body.type === 'play') r = G.doPlay(g, seat, body.ids);
        else if (body.type === 'pass') r = G.doPass(g, seat);
        else r = G.giveBack(g, seat, body.ids);
        if (!r.ok) return json(res, 400, { error: r.error });
        afterMove(room);
        return json(res, 200, { ok: true });
      }
      case 'next':
        if (room.phase !== 'game' || !g || g.phase !== 'end') return json(res, 400, { error: '結果表示中ではありません' });
        startRound(room, g.places);
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
