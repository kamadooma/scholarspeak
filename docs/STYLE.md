# Scholar Speak — Style Reference (based on "Flying Papers")
> Saturday morning cartoon confessional / riso cardstock poster. Theme: light only.

## Colors
--color-dusk-violet: #8584bd;   /* 舞台=ページ全面の背景。白背景にしない */
--color-hi-vis-yellow: #f4ed36; /* アウトライン系アクション枠・強調ラベル専用。塗りCTAにしない */
--color-buttery-yellow: #f9cc73;/* セカンダリ見出し・柔らかい枠 */
--color-lilac-shadow: #61609a;  /* ネストされたブロック背景 */
--color-bubblegum-pink: #f8c1ba;/* コンフェッティカード(装飾面) */
--color-matcha-cream: #b5c995;  /* コンフェッティカード */
--color-magenta-punch: #ac4f98; /* 一番目立たせたいアクセントカード */
--color-firecracker-red: #c94245;/* 強調帯・ハイライト背景 */
--color-bone-white: #f9f5f2;    /* 明色カード面・ヘアライン枠・violet上の文字 */
--color-ink-black: #1a1a1a;     /* 明色面の本文・枠線 */
--color-pure-black: #000000;    /* 黄色面の文字・最強コントラスト枠 */

## Typography (Web-safe substitutes)
- Display/見出し: 極太コンデンス系。font-family: 'Founders Grotesk Condensed','Arial Narrow','Avenir Next Condensed','Helvetica Neue',system-ui,sans-serif; weight 800–900; line-height 0.80–0.90; letter-spacing 0.02em。単語表示はポスター級(モバイルでは clamp(48px, 18vw, 96px) 目安)
- UI本文: Inter/system-ui 400、16px/1.0
- モノ(タグ・メタ・IPA・受領書風マイクロコピー): 'JetBrains Mono',ui-monospace,Menlo,monospace; 12px; line-height 0.8–1.0; tracking 0.05em
- ボタンラベル: 700 16px tracking 0.05em

## Shapes & Layout
- radius: カード 6px(絶対) / ボタン・タグ 100px(ピル)。この対比が署名
- 影・グラデ一切禁止。フラットな「絵の具」面と1–2pxの枠線で立体感を出す
- card padding 17px / element gap 17px / section gap 40px
- 1画面=1ポスター: デカい見出し1つ+要素少なめ+バイオレットの余白たっぷり
- アクセント色(pink/matcha/magenta/red)は同じ列に並べない。1画面2色まで

## Components mapping (Scholar Speak)
- ページ背景: Dusk Violet全面(ライト固定。ダークモード分岐は廃止)
- 単語カード表: Bone Whiteカード6px、単語=極太コンデンス超特大(Ink Black)、IPA=モノ12px
- 単語カード裏: Bone Whiteカード、セクション見出しはモノ12pxタグ風。context_quote(授業での使用例)は Hi-Vis Yellow面(#f4ed36)+Pure Black文字の帯
- 自己評価ボタン: 「覚えた!」=クリーム(#f9f5f2)ピル+黒文字(Gate Pill)、「あいまい」=Hi-Vis Yellowアウトラインピル(透明地+黄枠+黄文字)、「もう一度」=Bone Whiteアンダーラインテキストリンク(モノ12px)
- デッキ一覧: コンフェッティカード(pink/matcha/magenta/redを1枚ずつ順繰り、6px、影なし)。デッキ名はDisplay太字、件数はモノ
- 進捗リング→フラットなバー or 数字ポスター表示(影・グラデ不可)
- 下部タブナビ: Lilac Shadow(#61609a)面+Bone Whiteアイコン/ラベル(モノ10–12px)、選択中はHi-Vis Yellow
- アプリバー: 透明、中央にワードマーク「SCHOLAR SPEAK」Display 800、Hi-Vis Yellow
- ホームのeyebrow「Scholar Speak — 大学院英語ラボ」: モノ12px、Bone White

## Don't
- 塗りつぶしCTA(黄色ベタボタン)を作らない/影・グロー禁止/カード角丸を6pxより丸めない/白・クリームのページ背景にしない/アクセント色を敷き詰めない
