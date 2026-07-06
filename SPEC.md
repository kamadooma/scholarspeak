# Scholar Speak — 大学院レベル英単語 仕様書 v1

ディレクション: Fable 5 / 実装: Opus / データ・文書: Sonnet

## コンセプト
大学院レベルの英単語に苦戦する学習者向けの単語学習PWA。
大学院の授業・論文・スライドなどのテキストから抽出した「実際に使われた」TOEFL〜大学院レベルの単語・学術表現を、
文脈つきで覚える。学際的なディスカッションとプレゼンで使える英語が目標。
単語単体でなく **センテンスごと暗唱** してプレゼン力を上げる。

## 動作形式
- 静的PWA(GitHub Pages想定)。ビルド不要のvanilla HTML/CSS/JS。
- iPhone Safari「ホーム画面に追加」で全画面動作。オフライン対応(service worker)。
- データはリポジトリ内 `data/words.json`。カード生成はCowork側で行い、pushで更新。
- 学習進捗は localStorage(`lexilab-progress-v1`)。

## データスキーマ (data/words.json)
```json
{
  "meta": {
    "version": 1,
    "updated": "2026-07-06",
    "decks": [
      { "id": "seed", "name": "スターターデッキ", "source": "サンプル", "date": "2026-07-06" }
    ]
  },
  "entries": [
    {
      "id": "paradigm",
      "type": "word",                    // "word" | "phrase"(学術的言い回し)
      "deck": "seed",
      "term": "paradigm",
      "ipa": "/ˈpærədaɪm/",
      "pos": "noun",
      "level": "TOEFL/C1",
      "meaning_ja": "パラダイム、（思考の）枠組み",
      "gloss_en": "a typical model or framework of ideas",   // 平易な英語定義
      "etymology": "ギリシャ語 para-(そばに) + deigma(示すもの)。日本語で語源を丁寧に。",
      "mnemonic": "日本語での覚え方・connects到既知知識。苦戦する人向けに具体的に。",
      "context_quote": { "en": "授業で実際に使われた一文(あれば)", "ja": "その和訳", "source": "授業名/スライド 2026-07-06" },
      "examples": [
        { "en": "理解用例文", "ja": "和訳", "scene": "discussion" }   // scene: presentation | discussion | qa | reading
      ],
      "sentences": [
        { "en": "プレゼン/議論でそのまま使える暗唱用センテンス", "ja": "和訳", "scene": "presentation" }
      ],
      "synonyms": ["framework", "model"],
      "paraphrases": ["a shared way of thinking about ..."],  // 言い換え(平易な表現へ)
      "antonyms": ["anomaly"],
      "collocations": ["paradigm shift", "dominant paradigm"],
      "register": "academic",
      "tags": ["academic", "education"],
      "source": "seed"
    }
  ]
}
```
- 例文・暗唱センテンスは学習者の専攻・文脈(大学院での学際的な学び、ディスカッション/プレゼンなど)に関連づけてパーソナライズ。
- `phrase` タイプは "What I find compelling is ..." のような学術的言い回し。ipa/etymologyは省略可(null可)。

## 画面構成(モバイルファースト 390px、日本語UI)
1. **ホーム**: 今日の復習件数(due)、新規件数、進捗リング(習得率)、デッキ一覧(授業ごと)、学習開始ボタン。
2. **単語学習(フラッシュカード)**: 表=term+IPA+🔊、タップで裏=意味/語源/覚え方/授業での実際の使用文(context_quote)/例文/類義・言い換え・反意/コロケーション。自己評価3択「もう一度/あいまい/覚えた!」→SRS反映。
3. **センテンス練習**: 日本語訳を見て英文想起→タップで英文表示→🔊でシャドーイング(速度調整可)→対象語の穴埋め表示切替。プレゼン用sentencesを周回。
4. **一覧/検索**: 全カード検索、フィルタ(デッキ/タグ/type/習得状態)。カード詳細表示。
5. **設定**: TTS音声・速度、進捗リセット、データ再読込、統計。

## SRS(iKnow!風)
- 状態: new → learning → review → mastered。
- 間隔(日): [0, 1, 3, 7, 14, 30]。「もう一度」=step0、「あいまい」=同step再出題、「覚えた!」=step+1。step5到達でmastered。
- dueは日付ベース。ホームに本日due数を表示。

## 発音
- Web Speech API (speechSynthesis)、en-US優先。単語・センテンス両方読み上げ。速度0.6〜1.1。
- iOS制約: ユーザー操作イベント内で発話すること。

## デザイン(Claude Design)
- 温かみのあるスタイリッシュ路線: アイボリー背景(#F5F1EA系) + インク色テキスト + コーラル/テラコッタ(#D97757系)アクセント。ダークモード対応(prefers-color-scheme)。
- 単語はセリフ体ディスプレイ(Georgia/'Times New Roman'系スタック)、UIはsans。余白広め、角丸カード、subtleなflipアニメーション。
- safe-area-inset対応、下部タブナビ(ホーム/学習/センテンス/一覧/設定)。

## ファイル構成
```
lexilab/
  index.html        (単一ページ、CSS/JSは外部ファイル)
  css/style.css
  js/app.js
  data/words.json
  manifest.webmanifest
  sw.js             (cache-first + 更新検知、words.jsonはnetwork-first)
  icons/icon.svg  icon-180.png  icon-192.png  icon-512.png
  README.md
  docs/WORKFLOW.md  (Coworkでのカード追加手順+抽出プロンプト仕様)
  SPEC.md
```
