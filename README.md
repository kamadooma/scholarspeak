# Scholar Speak — 大学院レベル英単語

大学院レベルの英単語・学術表現に苦戦する学習者向けの、英単語学習PWA（Progressive Web App）です。

大学院の授業・論文・スライドから実際に使われたTOEFL〜大学院レベルの単語・学術的言い回しを、文脈つきで覚えます。単語単体ではなく **センテンスごと暗唱** して、学際的なディスカッションやプレゼンで使える英語力を身につけることを目標にしています。

詳しい仕様は [SPEC.md](./SPEC.md) を参照してください。

## 概要

- ビルド不要のvanilla HTML/CSS/JSで作られた静的PWA。
- GitHub Pagesでホスティングし、iPhoneのSafariから「ホーム画面に追加」することで、ネイティブアプリのように全画面で使えます。
- オフライン対応（Service Workerによるキャッシュ）。
- 学習データ（単語・フレーズ）は `data/words.json` に集約。カードの追加はCowork（Claude）と一緒に行い、GitHubへのpushで更新します。
- 学習の進捗（SRS状態）はブラウザのlocalStorageに保存されます（`lexilab-progress-v1`）。

## 機能一覧

1. **ホーム**
   - 今日の復習件数（due）、新規件数、進捗リング（習得率）を表示。
   - デッキ（授業ごとの単語セット）一覧と学習開始ボタン。

2. **単語学習（フラッシュカード）**
   - 表面: 見出し語＋IPA発音記号＋発音ボタン（🔊）。
   - タップで裏面へ: 意味、語源、覚え方（mnemonic）、授業での実際の使用文（context_quote）、例文、類義語・言い換え・反意語、コロケーション。
   - 自己評価3択「もう一度 / あいまい / 覚えた！」でSRS（間隔反復学習）に反映。

3. **センテンス練習**
   - 日本語訳を見て英文を思い出し、タップして正解を確認。
   - 🔊読み上げでシャドーイング練習（速度調整可）。
   - 対象語を穴埋めにする表示切替も可能。
   - プレゼン・議論でそのまま使える`sentences`を周回して暗唱力を鍛えます。

4. **一覧・検索**
   - すべてのカードを検索。デッキ／タグ／type（word・phrase）／習得状態でフィルタ。
   - カードをタップして詳細を確認。

5. **設定**
   - TTS（音声合成）の声・速度調整。
   - 学習進捗のリセット。
   - データ（words.json）の再読込。
   - 学習統計の表示。

## SRS（間隔反復学習）について

iKnow!風のシンプルなSRSを採用しています。

- 状態: `new`（新規）→ `learning`（学習中）→ `review`（復習中）→ `mastered`（習得済み）
- 出題間隔（日数）: `[0, 1, 3, 7, 14, 30]`
- 自己評価:
  - 「もう一度」→ step 0 に戻る
  - 「あいまい」→ 同じstepで再出題
  - 「覚えた！」→ step + 1（step 5に到達すると`mastered`）
- 本日の復習件数（due）はホーム画面に表示されます。

## iPhoneでの使い方（ホーム画面に追加）

1. iPhoneの **Safari** で、GitHub PagesのURL（例: `https://<ユーザー名>.github.io/lexilab/`）を開きます。
2. 画面下部（または上部）の **共有ボタン**（□に上矢印のアイコン）をタップします。
3. メニューを下にスクロールし、**「ホーム画面に追加」** をタップします。
4. アプリ名を確認して（必要なら編集して）、右上の **「追加」** をタップします。
5. ホーム画面にScholar Speakのアイコンが追加されます。アイコンをタップすると、Safariのアドレスバーなどが表示されない **全画面モード** でアプリが起動します。
6. 一度読み込めば、オフラインでも学習画面や既存データにアクセスできます（Service Workerによるキャッシュ）。

補足:
- 音声読み上げ（TTS）はiOSの制約上、ボタンタップなどのユーザー操作の直後にのみ再生されます。無音のままの場合は、もう一度🔊ボタンをタップしてください。
- データを更新した後は、設定画面の「データ再読込」をタップするか、アプリを一度完全に終了して開き直してください。

## GitHub Pagesでの公開手順

1. このフォルダ（`lexilab/`）の中身をGitHubリポジトリのルート、または任意のサブディレクトリにpushします。
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Scholar Speak PWA"
   git branch -M main
   git remote add origin https://github.com/<ユーザー名>/<リポジトリ名>.git
   git push -u origin main
   ```
2. GitHubのリポジトリページを開き、上部メニューの **Settings** を開きます。
3. 左側メニューから **Pages** を選択します。
4. **Build and deployment** の **Source** で `Deploy from a branch` を選択します。
5. **Branch** のドロップダウンで、公開したいブランチ（例: `main`）と、公開するフォルダ（`/ (root)` または `lexilab/` を含むリポジトリ構成なら該当パス）を選択し、**Save** をクリックします。
6. 数分待つと、ページ上部に公開URL（`https://<ユーザー名>.github.io/<リポジトリ名>/`）が表示されます。このURLをiPhoneのSafariで開いてください。
7. `data/words.json` を更新してpushすると、GitHub Pagesも自動的に再デプロイされます（数分のタイムラグあり）。反映されない場合は、アプリの設定画面から「データ再読込」を行うか、ブラウザのキャッシュをクリアしてください。

## 単語の追加方法

今後、授業で新しく出てきた単語・表現をカードとして追加していく運用は [docs/WORKFLOW.md](./docs/WORKFLOW.md) にまとめています。

大まかな流れ:

1. 授業のスライド・会話記録・テキストなどをCowork（Claude）に渡す。
2. ClaudeがTOEFL〜大学院レベルの単語・学術的言い回しを抽出し、`data/words.json` のスキーマに沿ったカードを生成する（このとき、授業で実際に使われた文を`context_quote`に必ず含める）。
3. 生成されたエントリを `data/words.json` にマージする（新しい授業ごとに新しいdeckを作成）。
4. `git commit` して `git push` する。
5. アプリの設定画面で「データ再読込」を実行し、新しいカードを反映する。

詳しい抽出・生成のルールやスキーマ全文は [docs/WORKFLOW.md](./docs/WORKFLOW.md) を参照してください。

## ファイル構成

```
lexilab/
  index.html        (単一ページ、CSS/JSは外部ファイル)
  css/style.css
  js/app.js
  data/words.json    (単語・フレーズのデータ本体)
  manifest.webmanifest
  sw.js              (Service Worker: cache-first + 更新検知、words.jsonはnetwork-first)
  icons/             (アプリアイコン各種)
  README.md          (このファイル)
  docs/WORKFLOW.md   (カード追加の運用手順)
  SPEC.md            (仕様書)
```
