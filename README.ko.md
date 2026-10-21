<div align="center">

# THE MACHINE

*"You are being watched."*

[English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · **한국어** · [Русский](README.ru.md)

<a href="https://rosehahah.github.io/the-machine/"><img src="docs/hero.webp" alt="The Machine의 시점: 비 오는 타임스스퀘어 감시 화면, 모든 사람에게 박스가 쳐지고 그중 한 명이 ADMIN으로 식별된다" width="100%"></a>

**[▶ 브라우저에서 콘솔 열기](https://rosehahah.github.io/the-machine/)** &nbsp;·&nbsp; [내 카메라로 실행하기](#빠른-시작) &nbsp;·&nbsp; [어떻게 만들었나](#어떻게-만들었나)

<sub>📷 머신이 <i>당신</i>을 판정하게 해 볼까요? 이 프로젝트의 감시 카메라 스타일 오버레이를 제 iOS 카메라 앱 <b>XianNow Camera</b>의 촬영 모드로 만들었습니다(다음 업데이트에서 배포 예정) → <a href="https://apps.apple.com/app/id6814311061?ct=machine_readme">App Store</a></sub>

</div>

미국 드라마 〈퍼슨 오브 인터레스트〉(*Person of Interest*)의 **The Machine**을 재현한 팬메이드 오픈소스 프로젝트입니다. The Machine의 시점(MPOV)이 여러분의 Mac과 iPhone 카메라에서 돌아갑니다. 화면 속 모든 사람에게 박스를 치고, 여러분을 ADMIN으로 알아보고, 칼이나 넘어짐을 감지하면 '번호'를 하나 내놓습니다. 이유는 절대 말하지 않습니다. 여기에 500명이 사는 가상 도시를 무대로 한 여러 페이지짜리 콘솔(카메라 월, 인물, 사건, 관계도, 지도, 로그)도 함께 있습니다.

모든 박스, 라벨, 색은 다섯 시즌 전체의 장면과 대조했습니다. 드라마에 나오지 않는 요소는 코드와 아래 설명에서 모두 '창작'이라고 표시했습니다.

<sub>위 애니메이션은 데모 사이트의 첫 화면입니다. 스톡 영상과 실제 인물 트래킹을 쓰고, 식별 장면은 연출된 스크립트입니다(영상 속 누구도 등록되어 있지 않습니다).</sub>

**〈퍼슨 오브 인터레스트〉에 깊은 감사를 전합니다.** Jonathan Nolan, Greg Plageman, J.J. Abrams, 그리고 모든 작가, 배우, 스태프 여러분. 다섯 시즌을, Harold와 John을, Root와 Shaw를, Fusco와 Carter를, Bear를, 그리고 The Machine을 고맙습니다. 이 드라마를 정말 사랑합니다. 이 프로젝트는 여러분 덕분에 존재합니다.

## 콘솔

여섯 페이지가 화면 아래의 타임라인 하나를 함께 씁니다. 가상 도시의 7일을 되감아 볼 수도 있고, 실시간으로 볼 수도 있습니다.

| | |
|---|---|
| ![카메라 월](docs/screenshots/feeds.jpg) **1 FEEDS** · 카메라 월, 맨해튼의 실제 교차로 32곳 | ![단일 카메라](docs/screenshots/feed.jpg) **1 FEEDS** · 단일 카메라 |
| ![인물 파일](docs/screenshots/subjects.jpg) **2 SUBJECTS** · 인물 파일: PRIMARY ASSET IDENTIFIED | ![사건](docs/screenshots/cases.jpg) **3 CASES** · 번호 |
| ![관계도](docs/screenshots/network.jpg) **4 NETWORK** · 누가 누구와 함께 찍혔나 | ![지도](docs/screenshots/map.jpg) **5 MAP** · 맨해튼, 진행 중인 작전 |
| ![로그](docs/screenshots/log.jpg) **6 LOG** · 시스템 로그 | ![로컬에서 실행한 MPOV](docs/screenshots/mpov.jpg) **MPOV** · 실시간 시점, 로컬 실행 |

<sub>스크린샷은 이 프로젝트를 가상 데이터와 [Mixkit](https://mixkit.co) 스톡 영상으로 실행한 화면입니다. 드라마 장면은 포함하지 않습니다.</sub>

## MPOV가 하는 일

- **모든 사람에게 박스를 칩니다**: Mac 카메라와 iPhone(연속성 카메라) 모두 지원. 드라마와 같은, 머리와 어깨를 감싸는 정사각형 박스입니다. 변은 점선, 모서리는 실선, 각 변 가운데에 눈금.
- **여러분을 알아봅니다**: 자신을 `ADMIN`으로 등록하면 박스가 흰색에서 노란색으로 깜빡이고, 인물 파일이 열리고, `GOOD EVENING, ADMIN.`이 표시됩니다. 다른 역할: `PRIMARY ASSET`, `SECONDARY ASSET`, `ANALOG INTERFACE`, `IRRELEVANT`.
- 카메라에서 카메라로 **따라갑니다**.
- **위협을 판단합니다**: 누군가 칼, 가위, 야구 방망이, 총을 들면 흰 박스에 빨간 모서리. 실제로 행동에 나서면 빨간 박스 `THREAT`. 누군가 넘어지면 `SUBJECT DOWN`.
- **번호를 내놓습니다**: 드라마와 같은 `###-00-####` 형식의 사회보장번호와 음성 알파벳으로 된 문구, 공중전화 벨 두 번. RELEVANT와 IRRELEVANT 두 개의 명단, macOS 알림, 선택적으로 휴대폰으로 보내는 iMessage.

## 빠른 시작

macOS 전용입니다. [uv](https://docs.astral.sh/uv/)와 `ffmpeg`가 필요합니다.

```bash
brew install uv ffmpeg
git clone https://github.com/rosehahah/the-machine
cd the-machine && ./run.sh
```

처음 실행할 때 Python 환경을 만들고, 모델(약 75 MB, `tools/fetch_models.sh`)과 콘솔용 스톡 영상(`tools/build_clips.py`)을 내려받느라 몇 분 걸립니다. 그다음 브라우저에서 **http://localhost:8000**(MPOV)이 열립니다. 콘솔은 **http://localhost:8000/console**입니다. 종료하려면 터미널에서 `Ctrl+C`를 누르세요. 카메라도 함께 꺼집니다.

- **카메라 권한**: macOS가 카메라 접근을 물으면 '허용'을 누르세요. `NO SIGNAL`이 보이면 시스템 설정 → 개인정보 보호 및 보안 → 카메라에서 사용 중인 터미널 앱을 켜고 다시 실행하세요.
- **iPhone 카메라**: 연속성 카메라를 씁니다. iPhone을 잠근 채 Mac 옆에 두고, 같은 Apple ID로 로그인해 두면 두 번째 화면으로 자동 추가됩니다. 나중에 연결됐다면 터미널 패널에서 RESCAN CAMERAS를 누르세요.

### ADMIN 되기

1. `M`을 눌러 ADMIN TERMINAL을 엽니다.
2. ENROLL SUBJECT에 이름(예: `FINCH, HAROLD`)을 입력하고 역할로 `ADMIN`을 고릅니다.
3. 혼자서, 팔 길이 정도 떨어져 현재 카메라를 바라보고 **ENROLL FROM CURRENT FEED**를 누릅니다.
4. `PROFILE COMPILED`가 뜰 때까지 2초 정도 가만히 있습니다.

그 뒤로 여러분이 화면에 나올 때마다 박스가 흰색에서 노란색으로 깜빡이고, `ADMIN` 라벨과 인물 파일, 인사말이 나옵니다. `PRIMARY ASSET`과 `SECONDARY ASSET`은 노란 박스, `ANALOG INTERFACE`는 검은 박스에 노란 모서리, `IRRELEVANT`는 흰 박스입니다. 등록되지 않은 사람은 모두 흰 박스입니다.

### 위협과 번호

규칙은 드라마 속 박스 범례를 따릅니다:

| 박스 | 나타나는 조건 |
|---|---|
| 흰 박스 | 평범한 사람 |
| **흰 박스에 빨간 모서리 + 빨간 조준선**, `POTENTIAL THREAT` | 칼, 가위, 야구 방망이, 총을 들고 있지만 아직 행동하지 않음 |
| **빨간 박스**, `THREAT` | 무기를 들고 행동에 나섬: 4초 넘게 들고 있거나, 다른 사람에게 다가가거나, ADMIN 또는 자산과 같은 화면에 있음(이 경우 바로 빨간색) |
| 천천히 깜빡임, `SUBJECT DOWN` | 누군가 넘어짐: 머리가 갑자기 낮은 곳으로 떨어져 그대로 있거나, 화면 아래로 사라짐 |

- **등록된 사람은 무기를 들어도 색이 바뀌지 않습니다.** 드라마의 Reese는 늘 총을 갖고 다니지만 박스는 계속 노란색입니다. 직접 효과를 보려면 훈련 기능을 쓰세요.
- 사건마다 **번호**가 하나 나옵니다. 등록된 사람의 번호는 고정이고, 모르는 사람은 익명 ID `UNKNOWN-0427`과 매번 무작위인 번호를 받습니다. 외부 데이터와는 전혀 대조하지 않습니다. 번호는 메모리에만 있고 다시 시작하면 사라집니다.
- **두 개의 명단**: ADMIN이나 자산이 위협받거나 넘어짐 → `RELEVANT`. 그 밖의 경우 → `IRRELEVANT`. ADMIN TERMINAL → THE LIST에서 보고, 해당 카메라로 이동하고, 사건을 종결할 수 있습니다.
- **훈련**(ADMIN TERMINAL → DRILLS): `SIMULATE ARMED SUBJECT`는 화면에서 가장 크게 잡힌 사람에게 6초 동안 '무기를 쥐여 주고', `SIMULATE SUBJECT DOWN`은 그 사람을 '넘어뜨립니다'. 훈련은 '등록된 사람은 격상되지 않는다'는 규칙을 무시하므로 혼자서도 해 볼 수 있습니다. 번호에는 `DRILL`이 붙습니다.
- **알림**(ADMIN TERMINAL → DISSEMINATION): macOS 알림은 기본으로 켜져 있습니다. iMessage는 전화번호나 Apple ID를 입력하고 SAVE를 누르세요(기본은 꺼짐. 번호와 문구만 보내고 사진은 보내지 않습니다). `SEND TEST`로 시험할 수 있습니다.

무기는 두 모델로 찾습니다. YOLOX는 매 프레임 돌아가서 빠르지만 손에 든 칼은 잘 놓칩니다. OWLv2는 사람이 있는 화면을 뒤에서 돌아가며 약 2초마다 다시 확인하고, 손에 든 칼이나 총도 찾아냅니다. 그래서 칼을 든 뒤 박스가 바뀌기까지 2~4초쯤 걸립니다. 계속 같은 자리에 있는 칼(칼꽂이, 벽걸이)은 가구로 보고 무시하며, 시작할 때부터 화면에 있던 칼도 마찬가지입니다.

### 단축키

| MPOV | |
|---|---|
| `M` | ADMIN TERMINAL 열기/닫기 |
| `1`–`9` | 카메라 전환(자동 추적이 꺼짐) |
| `F` | 전체 화면 |
| `X` | 색 보정과 필름 효과 켜기/끄기 |
| `Esc` | 터미널 패널 닫기 |

**자동 추적**(터미널의 AUTO-FOLLOW): 식별된 사람이 현재 카메라를 벗어나 다른 카메라에 나타나면 화면이 그쪽으로 넘어갑니다.

**콘솔**: `1`–`6` 페이지 전환, `Space` 재생/일시정지, `←` `→` 1분 뒤로/앞으로(`Shift`는 1시간), `L` 실시간으로 돌아가기, `F` 전체 화면, `Esc` 단일 카메라에서 카메라 월로. 지도는 휠로 확대/축소, 드래그로 이동, 카메라를 클릭하면 정보 카드.

### 카메라 없이

```bash
./run.sh --no-cameras --source ~/Movies/clip.mp4   # 동영상 파일 하나만
./run.sh --source photo.png                        # 카메라 + 추가 화면
```

## 콘솔 페이지별 설명

가상 도시는 `tools/gen_world.py`가 만듭니다: 500명, 7일, 맨해튼 실제 교차로의 카메라 32대, 번호 30개. 날짜 범위가 지났으면 시작할 때 새로 만듭니다(데모 사이트에서는 7일이 항상 오늘로 끝납니다). 실제 카메라와 번호는 LIVE로 합류합니다.

| 페이지 | 내용 | 대조한 장면 |
|---|---|---|
| `1` FEEDS | 카메라 월(16:9 그리드)과 단일 카메라 | S1 감시 화면 콜라주, S2 카메라 표시(예: `WASH SQ PK 8 11 / 11:15:51`) |
| `2` SUBJECTS | 인물 목록과 인물 파일. 그 사람이 마지막으로 찍힌 카메라 화면 위에 띄움 | S05E02 08m17s의 `PRIMARY ASSET IDENTIFIED` 패널 |
| `3` CASES | 번호 목록과 사건 상세 | 흑백 2단 상태 바(SPEC §4)와 같은 인물 파일 패널 |
| `4` NETWORK | 누가 누구와 함께 찍혔나(*관계도 자체는 창작*) | 외형은 S2–S3 미국 전국 지도에서: 검은 바탕, 빛나는 점, 흰 Futura, 가는 흰 테두리 |
| `5` MAP | 맨해튼 지도, 카메라, 열린 번호, 한 사람의 24시간 동선 | S04E13 37m42s, S04E21 36m04s: 흰 수면과 어두운 땅, 1 km 격자, 구역 통계 박스, 빨간 십자 조준선, `ACTIVE OPERATION` 동심원 |
| `6` LOG | 식별, 사건, 시스템 메시지 기록(*로그 페이지 자체는 창작*) | S05E13 36m04s의 시스템 박스 `[1] CORE SYSTEMS SHUTTING DOWN` |

지도는 `tools/build_map.py`가 OpenStreetMap의 도로와 해안선으로 만듭니다(shapely로 해안선을 닫아 땅으로 만듦). 캐시는 `media/osm_manhattan.json`, 결과물은 `web/data/manhattan.json`입니다.

## 어떻게 만들었나

이 프로젝트의 규칙은 하나입니다: **화면의 모든 요소는 드라마의 어느 한 프레임과 맞아야 한다.** 드라마에 없는 것은 몰래 넣지 않고 '창작'이라고 표시합니다.

1. **명세서.** [`research/SPEC.md`](research/SPEC.md)(중국어)는 스틸 약 30장과 팬 위키의 박스 기호를 근거로 MPOV를 정의합니다. 두 시각 시대(S1 감시 카메라, S3–S5 색 보정된 MPOV), 박스 모양, 색 범례, 라벨, 흑백 2단 상태 바, 인물 파일, 색감. 근거가 부족한 부분은 '확인 필요'로 표시했습니다.
2. **103화 전체 검색.** `tools/index_clip.py`가 전체 에피소드 프레임에 CLIP 인덱스를 만들고, `tools/find_shots.py`로 스틸이나 문장(예: 'a map of Manhattan with a red crosshair')을 넣어 검색합니다. 그렇게 찾은 것이 위 표의 참고 프레임입니다. 이 단계에는 직접 가진 영상이 필요하며, 인덱스와 프레임 모두 이 저장소에는 없습니다.
3. **다시 만들고, 다시 대조.** 각 페이지를 참고 프레임 옆에 두고 다시 만든 뒤 한 번 더 비교했습니다. 이렇게 잡아낸 실수: 박스는 전신을 감싸는 직사각형이 아니라 머리와 어깨를 감싸는 정사각형이어야 한다(`web/hud.js`의 `headBox()`, `backend/vision.py`의 `head_from_person`과 같은 규칙). TCK 카드, 빨간 ▽, `ELIMINATE`, 흰 바탕 `DEVIANT`는 사마리탄의 시점(SPOV)에 속하므로 여기서는 쓰지 않습니다.

나머지는 평범한 엔지니어링입니다: ffmpeg로 카메라 입력, YOLOX로 사람 검출, YuNet과 SFace로 얼굴 검출과 인식, ByteTrack으로 프레임 간 추적, OWLv2로 무기 재확인. UI는 색감에 WebGL, 박스에 Canvas, 서체는 Futura입니다.

## 개인정보

- 얼굴 데이터는 여러분의 Mac을 떠나지 않습니다. 등록한 얼굴 특징은 `data/identities.json`에 있고, 이 파일을 지우면 모두 잊힙니다.
- 아무것도 업로드하지 않습니다. 모르는 사람의 신원은 절대 확인하지 않고, 익명 ID만 붙습니다.
- 나이, 성별, 감정은 추정하지 않습니다.
- `data/`, 모델, 스톡 영상, 드라마 장면은 모두 `.gitignore`에 들어 있습니다.

## 파일 구성

| 경로 | 내용 |
|---|---|
| `backend/server.py` | 로컬 서버: 영상 처리 루프와 API |
| `backend/cameras.py` | 화면 입력: ffmpeg를 통한 Mac·iPhone 카메라, 동영상과 이미지 파일 |
| `backend/vision.py` | 사람(YOLOX), 얼굴(YuNet + SFace), 추적(ByteTrack) |
| `backend/threat.py` | 위협 엔진: 무기, 격상, 넘어짐 |
| `backend/numberbook.py` | 번호, 두 명단, 알림과 iMessage |
| `web/` | MPOV: `fx.js`(WebGL 색감), `hud.js`(박스와 라벨), `app.js` |
| `web/console/` | 콘솔: `pages/`에 페이지당 파일 하나, 가상 데이터는 `world.js`, 공용 타임라인은 `timeline.js` |
| `web/fonts/` | VT323(카메라 표시의 픽셀 글꼴), Share Tech Mono(S4–S5 카드와 지도), 둘 다 OFL |
| `tools/gen_world.py`, `tools/build_map.py`, `tools/build_clips.py` | 가상 도시, 맨해튼 지도, 스톡 영상과 그 인물 트래킹 |
| `tools/fetch_models.sh`, `tools/export_owlv2.py` | YuNet, SFace, YOLOX 다운로드. OWLv2를 ONNX로 내보내기(360 MB, 선택. 없으면 무기 검출은 YOLOX만) |
| `tools/index_clip.py`, `tools/find_shots.py` | 드라마 전체의 CLIP 프레임 인덱스와 검색(영상은 직접 준비) |
| `site/`, `tools/build_site.sh` | 데모 사이트. `tools/build_site.sh --publish`로 `gh-pages`에 게시 |
| `research/SPEC.md` | MPOV UI 명세 |
| `data/` | 등록한 얼굴과 알림 설정. 로컬 전용, 저장소에 들어가지 않음 |

## 진행 상황

- **완료**: P0 명세 · P1 '본다' · P2 '알아본다'(등록, 인식, 다중 카메라, 자동 추적) · P3 '판단한다'(무기, 넘어짐, 빨간 박스, 두 명단, 번호, 알림) · 6페이지 콘솔과 데모 사이트.
- **아직**: P4 이후. 예측 트리, 이어 붙인 음성, Admin과의 대화, 자정의 삭제, 사마리탄.
- 지금은 위협을 두 가지로만 봅니다: 손에 든 무기와 넘어짐. 싸움이나 미행을 판단하려면 자세 추정 모델이 필요합니다.
- 무기 검출은 놓칠 때가 있습니다: 빠르게 휘두를 때, 화면이 흐릴 때, 칼이 카메라에 옆으로 향할 때.
- 인식은 얼굴에만 의존합니다. 등을 돌린 사람에게는 박스는 있지만 이름은 없습니다. 이미 인식된 사람은 돌아서도 같은 카메라 안에서는 이름을 유지합니다.

## 크레딧

*비공식 팬 프로젝트입니다. CBS, Warner Bros. Television, Kilter Films, Bad Robot과 관계가 없으며 승인을 받지 않았습니다. 'Person of Interest'와 관련된 모든 이름은 각 권리자에게 있습니다. 이 저장소에는 드라마 영상이나 스틸이 포함되어 있지 않습니다.*

- 지도: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, ODbL
- 영상: [Mixkit](https://mixkit.co)(Mixkit Stock Video Free License). 실행할 때 내려받으며 재배포하지 않습니다
- 모델: OpenCV model zoo의 YuNet(MIT), SFace(Apache-2.0), YOLOX(Apache-2.0). Google OWLv2(Apache-2.0)
- 글꼴: VT323, Share Tech Mono(SIL OFL 1.1)
- 코드: MIT, [`LICENSE`](LICENSE) 참고
