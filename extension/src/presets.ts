/** プリセット返信（インプレゾンビ風・話題非依存を混在） */
const PRESET_REPLIES: readonly string[] = [
  "いいね押しといた！",
  "これは刺さるわ…",
  "学びが深いです🙏",
  "ほんこれ",
  "共感しかない",
  "天才か？？",
  "保存しました",
  "神ポスト来た",
  "読んでて元気出た",
  "まじでそれ",
  "心に響いた",
  "名言すぎる",
  "泣いた",
  "👏👏👏",
  "これは布教案件",
  "語彙力なくて言葉が出ない",
  "最高すぎて語彙力溶けた",
  "今日一のポスト",
  "深い。深すぎる。",
  "エモい",
  "尊い",
  "ありがとうございます",
  "勉強になりました！",
  "視座が高い",
  "刺さりました",
  "リポスト回しときます",
  "これは大事",
  "心から同意",
  "感謝しかない",
  "良い一日のスタートになった",
  "心が洗われた気分",
  "説得力がすごい",
  "冷静に見ても傑作",
  "歴史に残るポスト",
  "震えた",
  "鳥肌立った",
  "心の底から拍手",
];

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/** 重複を避けつつ必要件数を返す（足りなければ繰り返し） */
export function pickPresetReplies(count: number): string[] {
  const n = Math.max(0, Math.min(50, Math.floor(count)));
  if (n === 0) return [];
  const pool = [...PRESET_REPLIES];
  shuffleInPlace(pool);
  const out: string[] = [];
  while (out.length < n) {
    for (const line of pool) {
      if (out.length >= n) break;
      out.push(line);
    }
    if (pool.length === 0) break;
    shuffleInPlace(pool);
  }
  return out;
}
