<div align="center">

# THE MACHINE

*"You are being watched."*

[English](README.md) · [简体中文](README.zh-CN.md) · **日本語** · [한국어](README.ko.md) · [Русский](README.ru.md)

<a href="https://rosehahah.github.io/the-machine/"><img src="docs/hero.webp" alt="The Machine の視点：雨のタイムズスクエアの監視映像。全員が枠で囲まれ、そのうち一人が ADMIN と識別される" width="100%"></a>

**[▶ ブラウザでコンソールを開く](https://rosehahah.github.io/the-machine/)** &nbsp;·&nbsp; [自分のカメラで動かす](#クイックスタート) &nbsp;·&nbsp; [どうやって作ったか](#どうやって作ったか)

</div>

『パーソン・オブ・インタレスト　犯罪予知ユニット』（*Person of Interest*）の **The Machine** を再現した、ファンメイドのオープンソースプロジェクトです。The Machine の視点（MPOV）が、あなたの Mac と iPhone のカメラで動きます。映っている全員を枠で囲み、あなたを ADMIN と認識し、ナイフや転倒に気づき、ひとつの「番号」を出します。理由は決して言いません。さらに、500 人が暮らす架空の街を舞台にした複数ページのコンソール（カメラウォール、人物、事件、関係図、地図、ログ）もあります。

枠、ラベル、色はすべて全 5 シーズンの映像と照らし合わせています。劇中に登場しないものは、コードでも下の説明でも「オリジナル」と明記しています。

<sub>上のアニメーションはデモサイトのトップページです。素材映像と実際の人物トラッキングを使い、識別は演出用のスクリプトです（映像の中の誰も登録されていません）。</sub>

**『パーソン・オブ・インタレスト』に心からの感謝を。** Jonathan Nolan、Greg Plageman、J.J. Abrams、脚本家、キャスト、スタッフのみなさん。5 シーズンを、Harold と John を、Root と Shaw を、Fusco と Carter を、Bear を、そして The Machine をありがとう。このドラマが本当に大好きです。このプロジェクトはあなたたちがいたから生まれました。

## コンソール

6 つのページは画面下のタイムラインを共有しています。架空の街の 7 日間を巻き戻して見ることも、リアルタイムで見ることもできます。

| | |
|---|---|
| ![カメラウォール](docs/screenshots/feeds.jpg) **1 FEEDS** · カメラウォール、マンハッタンの実在する交差点 32 か所 | ![単一カメラ](docs/screenshots/feed.jpg) **1 FEEDS** · 単一カメラ |
| ![人物ファイル](docs/screenshots/subjects.jpg) **2 SUBJECTS** · 人物ファイル：PRIMARY ASSET IDENTIFIED | ![事件](docs/screenshots/cases.jpg) **3 CASES** · 番号 |
| ![関係図](docs/screenshots/network.jpg) **4 NETWORK** · 誰が誰と一緒に映ったか | ![地図](docs/screenshots/map.jpg) **5 MAP** · マンハッタン、進行中のオペレーション |
| ![ログ](docs/screenshots/log.jpg) **6 LOG** · システムログ | ![ローカルで動く MPOV](docs/screenshots/mpov.jpg) **MPOV** · ライブ視点、ローカル実行 |

<sub>スクリーンショットは、このプロジェクトを架空データと [Mixkit](https://mixkit.co) の素材映像で動かしたものです。劇中の映像は含みません。</sub>

## MPOV でできること

- **全員を枠で囲む**：Mac のカメラと iPhone（連係カメラ）に対応。劇中と同じ、頭と肩を囲む正方形の枠です。辺は破線、角は実線、各辺の中央に目盛り。
- **あなたを認識する**：自分を `ADMIN` として登録すると、枠が白から黄色に点滅し、人物ファイルが開き、`GOOD EVENING, ADMIN.` と表示されます。ほかのロール：`PRIMARY ASSET`、`SECONDARY ASSET`、`ANALOG INTERFACE`、`IRRELEVANT`。
- **カメラからカメラへ追いかける**。
- **脅威を判断する**：誰かがナイフ、ハサミ、バット、銃を手に取ると白枠に赤い角。実際に行動に出ると赤枠の `THREAT`。誰かが倒れると `SUBJECT DOWN`。
- **番号を出す**：劇中と同じ `###-00-####` 形式の社会保障番号と、フォネティックコードのフレーズ。公衆電話のベルが 2 回鳴ります。RELEVANT と IRRELEVANT の 2 つのリスト、macOS 通知、オプションで iPhone への iMessage。

## クイックスタート

macOS のみ。[uv](https://docs.astral.sh/uv/) と `ffmpeg` が必要です。

```bash
brew install uv ffmpeg
git clone https://github.com/rosehahah/the-machine
cd the-machine && ./run.sh
```

初回は Python 環境の構築、モデル（約 75 MB、`tools/fetch_models.sh`）とコンソール用素材映像（`tools/build_clips.py`）のダウンロードで数分かかります。その後ブラウザで **http://localhost:8000**（MPOV）が開きます。コンソールは **http://localhost:8000/console** です。終了はターミナルで `Ctrl+C`。カメラも一緒に閉じます。

- **カメラの許可**：macOS からカメラへのアクセスを求められたら「許可」を押してください。`NO SIGNAL` と表示される場合は、システム設定 → プライバシーとセキュリティ → カメラ で使っているターミナルアプリをオンにして、再起動してください。
- **iPhone のカメラ**：連係カメラを使います。iPhone をロックして Mac の近くに置き、同じ Apple ID でサインインしておくと、2 つ目の映像として自動で追加されます。あとから接続した場合は、ターミナルパネルの RESCAN CAMERAS を押してください。

### ADMIN になる

1. `M` で ADMIN TERMINAL を開きます。
2. ENROLL SUBJECT に名前（例：`FINCH, HAROLD`）を入力し、ロールで `ADMIN` を選びます。
3. ひとりで、腕の長さほど離れて今のカメラに向かい、**ENROLL FROM CURRENT FEED** を押します。
4. `PROFILE COMPILED` が出るまで、約 2 秒じっとしてください。

それ以降、あなたが映るたびに枠が白から黄色に点滅し、`ADMIN` ラベル、人物ファイル、あいさつが表示されます。`PRIMARY ASSET` と `SECONDARY ASSET` は黄枠、`ANALOG INTERFACE` は黒枠に黄色の角、`IRRELEVANT` は白枠。登録されていない人はすべて白枠です。

### 脅威と番号

ルールは劇中の枠の凡例に従っています：

| 枠 | 表示される条件 |
|---|---|
| 白枠 | 普通の人 |
| **白枠に赤い角 + 赤い照準**、`POTENTIAL THREAT` | ナイフ、ハサミ、バット、銃を持っているが、まだ行動していない |
| **赤枠**、`THREAT` | 武器を持って行動に出た：4 秒以上持ち続けている、誰かに近づいた、または ADMIN や資産と同じ画面にいる（この場合はすぐ赤になる） |
| ゆっくり点滅、`SUBJECT DOWN` | 誰かが倒れた：頭が急に低い位置まで落ちてそのまま、または画面の下へ消えた |

- **登録済みの人は武器を持っても色が変わりません。** 劇中の Reese はいつも銃を持っていますが、枠は黄色のままです。自分で効果を確かめるには演習を使ってください。
- 事件のたびに**番号**が出ます。登録済みの人の番号は固定。知らない人は匿名 ID `UNKNOWN-0427` で、番号は毎回ランダムです。外部のデータとは一切照合しません。番号はメモリ上にしかなく、再起動で消えます。
- **2 つのリスト**：ADMIN や資産が脅かされた、または倒れた → `RELEVANT`。それ以外 → `IRRELEVANT`。ADMIN TERMINAL → THE LIST で確認、該当カメラへの移動、事件のクローズができます。
- **演習**（ADMIN TERMINAL → DRILLS）：`SIMULATE ARMED SUBJECT` は画面でいちばん大きく映っている人に 6 秒間「武器を持たせ」、`SIMULATE SUBJECT DOWN` は「倒れさせ」ます。演習では「登録済みの人はエスカレートしない」ルールを無視するので、ひとりでも試せます。番号には `DRILL` と付きます。
- **通知**（ADMIN TERMINAL → DISSEMINATION）：macOS 通知はデフォルトでオン。iMessage は電話番号か Apple ID を入れて SAVE（デフォルトはオフ。番号とフレーズだけを送り、写真は送りません）。`SEND TEST` で試せます。

武器は 2 つのモデルで検出します。YOLOX は毎フレーム動き、速いものの手に持ったナイフは見逃しがちです。OWLv2 は人が映っている映像を裏で順番に約 2 秒ごとに再確認し、手に持ったナイフや銃も見つけます。そのため、ナイフを手に取ってから枠が変わるまで 2〜4 秒ほどかかります。同じ場所に置かれたままのナイフ（包丁立て、壁掛け）は置物として無視され、起動時から映っているナイフも同様です。

### キー操作

| MPOV | |
|---|---|
| `M` | ADMIN TERMINAL の開閉 |
| `1`–`9` | カメラ切り替え（自動追跡はオフになる） |
| `F` | 全画面 |
| `X` | カラーグレーディングとフィルム効果のオン／オフ |
| `Esc` | ターミナルパネルを閉じる |

**自動追跡**（ターミナルの AUTO-FOLLOW）：識別済みの人が今のカメラから消えて別のカメラに現れると、画面がそちらに切り替わります。

**コンソール**：`1`–`6` でページ切り替え、`Space` で再生／一時停止、`←` `→` で 1 分戻る／進む（`Shift` で 1 時間）、`L` でリアルタイムに戻る、`F` で全画面、`Esc` で単一カメラからウォールに戻る。地図はホイールでズーム、ドラッグで移動、カメラをクリックで情報カード。

### カメラなしで試す

```bash
./run.sh --no-cameras --source ~/Movies/clip.mp4   # 動画ファイルだけを映す
./run.sh --source photo.png                        # カメラ + 追加の映像
```

## コンソールの各ページ

架空の街は `tools/gen_world.py` が生成します：500 人、7 日間、マンハッタンの実在する交差点に置いた 32 台のカメラ、30 件の番号。日付の範囲が古くなっていれば起動時に作り直します（デモサイトでは 7 日間が常に今日で終わります）。実際のカメラと番号は LIVE として加わります。

| ページ | 内容 | 照合した映像 |
|---|---|---|
| `1` FEEDS | カメラウォール（16:9 グリッド）と単一カメラ | S1 の監視映像コラージュ、S2 のカメラ表示（例：`WASH SQ PK 8 11 / 11:15:51`） |
| `2` SUBJECTS | 人物一覧と人物ファイル。その人が最後に映ったカメラ映像の上に重ねて表示 | S05E02 08m17s の `PRIMARY ASSET IDENTIFIED` パネル |
| `3` CASES | 番号の一覧と事件の詳細 | 白黒 2 段のステータスバー（SPEC §4）と同じ人物ファイルパネル |
| `4` NETWORK | 誰が誰と一緒に映ったか（*関係図そのものはオリジナル*） | 見た目は S2–S3 の全米地図から：黒地、光の点、白の Futura、細い白枠 |
| `5` MAP | マンハッタンの地図、カメラ、未解決の番号、ある人物の 24 時間の軌跡 | S04E13 37m42s、S04E21 36m04s：白い水面と暗い陸地、1 km グリッド、地区の統計ボックス、赤い十字の照準、`ACTIVE OPERATION` の同心円 |
| `6` LOG | 識別、事件、システムメッセージの記録（*ログページそのものはオリジナル*） | S05E13 36m04s のシステムボックス `[1] CORE SYSTEMS SHUTTING DOWN` |

地図は `tools/build_map.py` が OpenStreetMap の道路と海岸線から作ります（shapely で海岸線を閉じて陸地にする）。キャッシュは `media/osm_manhattan.json`、出力は `web/data/manhattan.json` です。

## どうやって作ったか

このプロジェクトのルールはひとつ：**画面上のすべての要素は、劇中のどこかのフレームと一致しなければならない。** 劇中にないものは、こっそり足さずに「オリジナル」と明記します。

1. **仕様書。** [`research/SPEC.md`](research/SPEC.md)（中国語）は、約 30 枚のスチルとファン wiki の枠シンボルから MPOV を定義しています。2 つの時代（S1 の監視カメラ、S3–S5 のグレーディングされた MPOV）、枠の形、色の凡例、ラベル、白黒 2 段のステータスバー、人物ファイル、色調。根拠が足りない部分には「要確認」と付けています。
2. **全 103 話を検索。** `tools/index_clip.py` が全話のフレームに CLIP のインデックスを作り、`tools/find_shots.py` でスチルや文章（例：「a map of Manhattan with a red crosshair」）から検索します。見つかったものが上の表の参照フレームです。この作業には自分で用意した映像が必要で、インデックスもフレームもこのリポジトリには入っていません。
3. **作り直して、また照合。** 各ページを参照フレームの横で作り直し、もう一度見比べました。こうして見つかった間違い：枠は全身を囲む長方形ではなく、頭と肩を囲む正方形でなければならない（`web/hud.js` の `headBox()`、`backend/vision.py` の `head_from_person` と同じルール）。TCK カード、赤い ▽、`ELIMINATE`、白地の `DEVIANT` はサマリタンの視点（SPOV）のものなので、ここでは使っていません。

あとは普通のエンジニアリングです：ffmpeg でカメラを取り込み、YOLOX で人物検出、YuNet と SFace で顔の検出と認識、ByteTrack でフレーム間の追跡、OWLv2 で武器を再確認。UI は色調が WebGL、枠が Canvas、書体は Futura です。

## プライバシー

- 顔データはあなたの Mac から出ません。登録した顔の特徴量は `data/identities.json` にあり、このファイルを消せば全員が忘れられます。
- 何もアップロードしません。知らない人の身元を特定することはなく、匿名 ID が付くだけです。
- 年齢、性別、感情は推定しません。
- `data/`、モデル、素材映像、劇中の映像はすべて `.gitignore` に入っています。

## ファイル構成

| パス | 内容 |
|---|---|
| `backend/server.py` | ローカルサーバー：映像処理ループと API |
| `backend/cameras.py` | 映像の入力：ffmpeg 経由の Mac・iPhone カメラ、動画や画像ファイル |
| `backend/vision.py` | 人物（YOLOX）、顔（YuNet + SFace）、追跡（ByteTrack） |
| `backend/threat.py` | 脅威エンジン：武器、エスカレーション、転倒 |
| `backend/numberbook.py` | 番号、2 つのリスト、通知と iMessage |
| `web/` | MPOV：`fx.js`（WebGL の色調）、`hud.js`（枠とラベル）、`app.js` |
| `web/console/` | コンソール：`pages/` に 1 ページ 1 ファイル、架空データは `world.js`、共通のタイムラインは `timeline.js` |
| `web/fonts/` | VT323（カメラ表示のピクセル書体）、Share Tech Mono（S4–S5 のカードと地図）、どちらも OFL |
| `tools/gen_world.py`、`tools/build_map.py`、`tools/build_clips.py` | 架空の街、マンハッタンの地図、素材映像とその人物トラッキング |
| `tools/fetch_models.sh`、`tools/export_owlv2.py` | YuNet、SFace、YOLOX のダウンロード。OWLv2 の ONNX 書き出し（360 MB、任意。なければ武器検出は YOLOX のみ） |
| `tools/index_clip.py`、`tools/find_shots.py` | 全話の CLIP フレームインデックスと検索（映像は各自で用意） |
| `site/`、`tools/build_site.sh` | デモサイト。`tools/build_site.sh --publish` で `gh-pages` に公開 |
| `research/SPEC.md` | MPOV の UI 仕様 |
| `data/` | 登録した顔と通知設定。ローカルのみで、リポジトリには入りません |

## 進捗

- **完了**：P0 仕様 · P1「見える」· P2「わかる」（登録、認識、複数カメラ、自動追跡）· P3「判断する」（武器、転倒、赤枠、2 つのリスト、番号、通知）· 6 ページのコンソールとデモサイト。
- **未着手**：P4 以降。予測ツリー、切り貼りの音声、Admin との対話、深夜の消去、サマリタン。
- 脅威として見ているのは今のところ 2 つだけ：手に持った武器と転倒。けんかや尾行の判断には姿勢推定モデルが必要です。
- 武器検出には見逃しがあります：速く振ったとき、映像がぶれたとき、ナイフがカメラに対して横向きのとき。
- 認識は顔だけに頼っています。背を向けた人には枠が付きますが名前は出ません。いったん認識された人は、振り向いても同じカメラの中では名前を保ちます。

## クレジット

*非公式のファンプロジェクトです。CBS、Warner Bros. Television、Kilter Films、Bad Robot とは関係がなく、承認も受けていません。「Person of Interest」と関連する名称はすべて各権利者に帰属します。このリポジトリに劇中の映像やスチルは含まれていません。*

- 地図：© [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors、ODbL
- 映像：[Mixkit](https://mixkit.co)（Mixkit Stock Video Free License）。実行時にダウンロードし、再配布はしません
- モデル：OpenCV model zoo の YuNet（MIT）、SFace（Apache-2.0）、YOLOX（Apache-2.0）。Google OWLv2（Apache-2.0）
- フォント：VT323、Share Tech Mono（SIL OFL 1.1）
- コード：MIT、[`LICENSE`](LICENSE) を参照
