---
name: scholarspeak-dev
description: Scholar Speak（ビルド不要のvanilla PWA）を安全に開発・修正するための手順とレイアウト不変条件。UI/データを触る前に必ず読む。
---

# Scholar Speak 開発スキル

Scholar Speak は **ビルド不要の vanilla HTML/CSS/JS PWA**。GitHub Pages で配信し、iPhone Safari から「ホーム画面に追加」してフルスクリーンで使う。この文書は、**画面が崩れない・修正が確実に反映される**ための開発フローと不変条件をまとめる。UI や `data/words.json` を変更するときは着手前にここを読む。

## いつこの手順を使うか（条件定義）

- `index.html` / `css/style.css` / `js/app.js` / `data/words.json` / `sw.js` のどれかを変更するとき → **必ず**。
- 見た目・レイアウトに関わる変更 → **必ずブラウザで複数幅を目視確認**（下の「レスポンシブ確認」）。
- 単語データの追加・編集 → 「データ規約」に従い、**term でde-dup**。
- 本番（GitHub Pages）へ反映するとき → **Service Worker の `CACHE_VERSION` を上げる**。

## 開発ループ

1. **ローカル配信**: リポジトリ直下で `python3 -m http.server 8777 --bind 127.0.0.1`。`http://127.0.0.1:8777/index.html` を開く。
2. **キャッシュを疑え**: これは PWA で Service Worker が app shell を **cache-first** で返す。コードを直しても古い画面が出るのが正常。ブラウザ確認前に必ず SW を解除してからリロードする:
   ```js
   const rs = await navigator.serviceWorker.getRegistrations();
   for (const r of rs) await r.unregister();
   for (const k of await caches.keys()) await caches.delete(k);
   location.reload();
   ```
3. **複数幅で目視**（下記チェックリスト）。狭幅（〜340px）と広幅の両方。
4. **構文チェック**: `node --check js/app.js`、`python3 -c "import json;json.load(open('data/words.json'))"`。
5. **本番反映**: `sw.js` の `CACHE_VERSION` を上げてから commit / push。上げ忘れると既存ユーザーに修正が届かない。

## レスポンシブ確認（Webデザインの当然の前提）

> ウィンドウ幅を変えて UI が崩れないか確認するのは、Webを作るときの当たり前の作業。省略しない。

変更後、ブラウザで **狭幅・広幅** を実際に見て、次を確認する:

- [ ] 横スクロールが出ていない（`body { max-width:100% }`、`img/video { max-width:100% }`）。
- [ ] 下部タブバー等に**コンテンツが潜り込んで押せない**箇所がない。
- [ ] 長い文字列（英語のデッキ名・意味）が**はみ出さない**（省略 or 折り返し）。
- [ ] スクロール領域が最後まで到達できる（下部のボタンがバー裏に隠れない）。
- [ ] 6つのタブラベルが最狭幅でも折り返さない。

## レイアウト不変条件（これを破ると崩れる）

過去に実際に起きた崩れと、その恒久対策:

1. **下部バーは通常フローに置く（絶対配置で被せない）。**
   `.tabbar` は `#app`（flex縦）の最下段。`position:absolute; bottom:0` にすると、その上のスクロール領域にコンテンツが潜り込み「ボタンが押せない/次へが押せない」不具合になる。→ フロー配置なら被りが構造的に起きない。各画面ごとに `padding-bottom: tabbar分` を足して回避する方式は破綻しやすいので使わない。

2. **flex の子をスクロールさせるなら `min-height:0`。**
   `.main { flex:1; overflow-y:auto; min-height:0 }`。`min-height:0` が無いと flex子がコンテンツ高まで膨らみ、`overflow` が効かず「スマホで下にスクロールできない」不具合になる。

3. **長い文字列は省略 or 折り返し。**
   1行省略は `display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis`（`display:block` 必須。inline要素では ellipsis が効かない）。名前と操作ボタンが横並びなら、名前側 `flex:1; min-width:0`、ボタン側 `flex-shrink:0`。

4. **同じ情報を二度描かない。**
   詳細ビュー(`openSheet`)は `buildCardBack()` が既に見出し語を描くので、独自の見出しを重ねて出さない（「見出し語が2回」不具合）。共通描画関数にオプション（例 `{meta:true}`）を渡してメタ情報だけ足す。

5. **チップ/タグの重複を除く。**
   `register` と `tags` を結合表示するときは `dedupTags()` で大小無視の重複除去（"academic" が2回出る不具合）。

## クイズ画面の描画順（重要）

DOM順は **prompt → choices → feedback**。回答後は「選択肢（正誤色付き）→ フィードバック（答え・例文・もっと詳しく/次へ）」の順で読めること。feedback を choices の上に置くと、回答後に「次へ」ボタンの下に選択肢が残って崩れて見える。

## データ規約（data/words.json）

- 構造: `{ meta: { decks:[{id,name,source,date}] }, entries:[…] }`。
- entry 主要フィールド: `id, type('word'|'phrase'), deck, term, ipa, pos, level, meaning_ja, gloss_en, etymology, mnemonic, context_quote, examples[], sentences[], synonyms[], collocations[], related[], register, tags[], source`。
- `meaning_ja` はクイズの選択肢に使われるので**必ず入れる**。
- **追加時は term（大小無視）で de-dup**。既存にある語は足さない。
- デッキ名・UIラベルは**英語**。
- 一緒に覚えたい語は `related`（term文字列の配列）。フラッシュ裏面と辞書に「一緒に覚えたい単語」チップとして出る。
- 出題順は毎回シャッフル（学習キュー・センテンス練習ともに `shuffle()`）。

## アイコン

絵文字を使わず、`currentColor` を継承するモノライン SVG に統一（線幅 1.8）。スピーカーは JS 定数 `SPK_ICON`、タブは `index.html` 内のインラインSVG。色は cobalt に揃う。
