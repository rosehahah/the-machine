# The Machine

> *"You are being watched."*

A fan-made, open-source recreation of **The Machine** from *Person of Interest* — its MPOV interface running on your own Mac and iPhone cameras, plus a multi-page console (camera wall, subjects, cases, network, map, log) on a mock city.

![MPOV — The Machine's point of view on a live feed](docs/screenshots/mpov.jpg)

| | |
|---|---|
| ![Camera wall](docs/screenshots/feeds.jpg) **FEEDS** — camera wall | ![Single feed](docs/screenshots/feed.jpg) **FEEDS** — single camera |
| ![Subject dossier](docs/screenshots/subjects.jpg) **SUBJECTS** — dossier | ![Case](docs/screenshots/cases.jpg) **CASES** — numbers |
| ![Network](docs/screenshots/network.jpg) **NETWORK** — who was seen with whom | ![Map](docs/screenshots/map.jpg) **MAP** — Manhattan |
| ![Log](docs/screenshots/log.jpg) **LOG** — system log | |

<sub>Screenshots of this project running on mock data and Mixkit stock footage. No frames from the show.</sub>

**With deep thanks to *Person of Interest*.** To Jonathan Nolan, Greg Plageman, J.J. Abrams, the writers, the cast and the crew: thank you for five seasons, for Harold and John, Root and Shaw, Fusco and Carter, Bear — and for The Machine. We love this show so much. Every box, label and frame here was rebuilt by studying the episodes, one frame at a time. This project exists because of you.

*Unofficial fan project. Not affiliated with or endorsed by CBS, Warner Bros. Television, Kilter Films or Bad Robot. "Person of Interest" and all related names belong to their owners. No footage or stills from the show are included in this repository.*

Quick start (macOS, needs [uv](https://docs.astral.sh/uv/) and `ffmpeg`): `git clone` this repo, run `./run.sh`, open http://localhost:8000 (console: http://localhost:8000/console). The first run downloads the models (~75 MB) and the stock footage for the console. Code is MIT. Docs below are in Chinese.

---

复刻《疑犯追踪》The Machine 的 MPOV 界面：它接入 Mac 和 iPhone 的摄像头，框出画面里的人，认出你之后标成 ADMIN，并且能在多个摄像头之间跟着你切换。

## 启动

```bash
~/the-machine/run.sh
```

需要 macOS、[uv](https://docs.astral.sh/uv/) 和 `ffmpeg`（`brew install uv ffmpeg`）。第一次运行会自动建 Python 环境、下载模型（约 75 MB，`tools/fetch_models.sh`）和控制台用的 Mixkit 素材（`tools/build_clips.py`），要等几分钟。

约 4 秒后浏览器会自动打开 **http://localhost:8000**。要退出，在终端按 `Ctrl+C`，摄像头会一起关闭。

- **第一次运行**：macOS 可能弹窗请求摄像头权限，点「允许」。如果画面显示 `NO SIGNAL`，去 系统设置 → 隐私与安全性 → 摄像头，打开你所用终端 App 的开关，然后重新启动。
- **iPhone 摄像头**：用的是「连续互通相机」。iPhone 要锁屏、放在 Mac 旁边，并且和 Mac 登录同一个 Apple ID。系统会自动把它加为第二路画面。如果开机时没接上，接上后在终端里点 RESCAN CAMERAS。

## 第一次使用：把自己录成 ADMIN

1. 按 `M` 打开 ADMIN TERMINAL。
2. 在 ENROLL SUBJECT 里填名字（比如 `FINCH, HAROLD`），角色选 `ADMIN`。
3. 一个人面对当前摄像头，距离大约一臂，点 **ENROLL FROM CURRENT FEED**。
4. 保持不动约 2 秒，看到 `PROFILE COMPILED` 就录好了。

之后每次你出现在画面里，方框会从白色闪成黄色，旁边出现 `ADMIN` 标签和档案卡，并显示 `GOOD EVENING, ADMIN.`。

其他角色：`PRIMARY ASSET` 和 `SECONDARY ASSET` 是黄框，`ANALOG INTERFACE` 是黑框黄角，`IRRELEVANT` 是白框。没录入的人一律白框。

## 威胁判断和号码（P3）

规则按剧里的方框图例来：

| 方框 | 什么时候出现 |
|---|---|
| 白框 | 普通人 |
| **白框红角 + 红色准星**，标签 `POTENTIAL THREAT` | 有人手里拿着刀、剪刀、球棒或枪。剧里叫「无关名单上的威胁」：还没动手 |
| **红框**，标签 `THREAT` | 拿着武器又「动手了」：持械超过 4 秒，或者靠近别人，或者跟 ADMIN / 资产同在一个画面（这种直接变红） |
| 方框慢闪，标签 `SUBJECT DOWN` | 有人摔倒：头快速掉到很低的位置并停在那里，或者从画面底部摔出去 |

- **已录入的人（ADMIN、资产）拿刀不会变色**。剧里 Reese 一直带枪，方框始终是黄的。要自己试效果，用下面的演练。
- 每次出事，Machine 会发出一个**号码**：剧里那种 `###-00-####` 格式的 SSN，加一句暗语（`Harbor, Victor, Echo; …`）。**它不说为什么**。会响两声公用电话铃，弹出号码卡（带截图），再打出暗语。
- 已录入的人号码固定。陌生人只有匿名编号 `UNKNOWN-0427`，号码每次随机，不跟任何外部数据比对。
- **两张名单**：ADMIN 或资产被威胁、或者摔倒 → `RELEVANT`；其他 → `IRRELEVANT`。在 ADMIN TERMINAL 的 THE LIST 里查看、跳到对应摄像头、结案。号码只存在内存里，重启就清空。

**演练**（ADMIN TERMINAL → DRILLS）：`SIMULATE ARMED SUBJECT` 让当前画面里最大的那个人「拿上武器」6 秒，`SIMULATE SUBJECT DOWN` 让他「摔倒」。演练会无视「已录入的人不升级」这条规则，所以一个人也能试。号码上会标 `DRILL`。

**推送**（ADMIN TERMINAL → DISSEMINATION）：
- `MAC NOTIFICATIONS`：默认开，新号码弹 macOS 通知。
- iMessage：填你的手机号或 Apple ID 再点 SAVE，新号码会用「信息」App 发到你手机上。默认关。只发号码和暗语，不发照片。第一次发送时 macOS 可能会问是否允许终端控制「信息」，点允许。`SEND TEST` 可以先试一下。

**武器检测**用两个模型：YOLOX 每帧都跑，快但认不准手里的刀；OWLv2 在后台轮流复核有人的画面，每路约 2 秒一次，认得出手里拿的刀和枪。所以从拿起刀到出框大约要 2–4 秒。一直放在同一个位置的刀（刀架、墙上挂的）会被当成摆设忽略；启动时画面里已有的刀也一样。

## 快捷键

| 键 | 作用 |
|---|---|
| `M` | 打开或关闭 ADMIN TERMINAL |
| `1`–`9` | 切换摄像头（同时关闭自动跟随） |
| `F` | 全屏 |
| `X` | 开关画面调色和质感效果 |
| `Esc` | 关闭终端面板 |

**自动跟随**（终端里的 AUTO-FOLLOW）：已识别的人离开当前摄像头、出现在另一个摄像头时，画面会自动切过去。

## 控制台（http://localhost:8000/console）

多页面的总控台，所有页面共用底部的时间轴。数据是 mock 的：`tools/gen_world.py` 生成一座假城市，共 500 人、7 天、32 个曼哈顿真实路口机位、30 个号码。服务启动时如果日期窗口过期，会自动重新生成。真实摄像头和号码会以 LIVE 的形式并入。

| 页 | 内容 | 对照的剧照 |
|---|---|---|
| `1` FEEDS | 摄像头墙（16:9 拼墙）和单路画面 | S1 监控拼贴（`research/hits/ref_wall`）、S2 机位角标 `WASH SQ PK 8 11 / 11:15:51`（`ref_rewind`） |
| `2` SUBJECTS | 人员目录和档案。档案浮在此人最后出现的机位画面上 | S05E02 08m17s `PRIMARY ASSET IDENTIFIED` 面板（`ref_dossier`） |
| `3` CASES | 号码列表和案件详情 | 双层状态条（SPEC §4）+ 同一种档案面板 |
| `4` NETWORK | 谁和谁同框过（关系图本身是自创） | 外观借用 S2–S3 全国地图：黑底、光点、Futura 白字、细白框（`ref_network`） |
| `5` MAP | 曼哈顿地图、机位、开着的号码、人的 24 小时轨迹 | S04E13 37m42s、S04E21 36m04s：白水面深陆地、1 km 网格、区名统计框、红色十字准星、`ACTIVE OPERATION` 同心圆（`ref_map`） |
| `6` LOG | 识别、案件和系统消息的流水（日志页本身是自创） | S05E13 36m04s 系统框 `[1] CORE SYSTEMS SHUTTING DOWN` |

剧里没有的元素，代码注释都标了「自创」。

**快捷键**：`1`–`6` 切页，`空格` 播放/暂停，`←` `→` 前后 1 分钟（按住 Shift 是 1 小时），`L` 回到实时，`F` 全屏，`Esc` 从单路画面回到摄像头墙。地图用滚轮缩放、拖动平移、点机位看信息卡。

**地图数据**：`tools/build_map.py` 从 OpenStreetMap 取曼哈顿的街道和海岸线，并用 shapely 把海岸线闭合成陆地多边形，输出 `web/data/manhattan.json`。缓存在 `media/osm_manhattan.json`，有缓存时不联网。地图只覆盖曼哈顿周边一个窄长框，所以纵向不能拖出这个框，横向最多多看 30%，框外画成没有街道的陆地。

## 不开摄像头，用视频或图片测试

```bash
./run.sh --no-cameras --source ~/Movies/clip.mp4
./run.sh --source research/img/POI_0502_MPOV_Threats_Identified.png   # 摄像头 + 额外一路
```

## 文件

| 路径 | 内容 |
|---|---|
| `research/SPEC.md` | P0 界面规范：方框、标签、状态条、档案卡、调色。标了待核对项 |
| `research/img/` | 剧照和 wiki 的方框符号（版权原因不放进仓库） |
| `backend/` | 服务端：摄像头采集（ffmpeg）、人体检测（YOLOX）、人脸检测和识别（YuNet + SFace）、跟踪（ByteTrack） |
| `backend/threat.py` | 威胁引擎：持械、升级、摔倒 |
| `backend/numberbook.py` | 号码、两张名单、推送 |
| `models/` | YuNet、SFace、YOLOX 由 `tools/fetch_models.sh` 从 OpenCV model zoo 下载 |
| `models/owlv2_weapons.onnx` | 武器复核模型（OWLv2，Apache-2.0，360 MB）。仓库里没有，太大；用 `tools/export_owlv2.py` 导出。没有它也能跑，只是武器检测只用 YOLOX |
| `web/` | 界面：WebGL 调色，Canvas 画方框，Futura 字体 |
| `web/console/` | 控制台：`pages/` 里每页一个文件，`world.js` 读 mock 数据 |
| `web/fonts/` | VT323（机位角标的像素字）、Share Tech Mono（S4–S5 卡片和地图上的等宽字），都是 OFL 授权 |
| `tools/gen_world.py`、`tools/build_map.py` | 生成控制台的 mock 城市、曼哈顿地图 |
| `research/hits/` | 用 CLIP 在全剧里搜出来的参考帧（`tools/find_shots.py`，需要你自己的片源；不放进仓库） |
| `data/identities.json` | 录入的人脸特征。**只存在这台 Mac 上**，删掉这个文件就清空了所有人 |
| `data/config.json` | 推送设置 |

## 现在能做和还不能做的

- 已完成：P0 规范、P1「看得见」、P2「认得出」（录入、识别、多摄像头、自动跟随）、P3「会判断」（持械、摔倒、红框、两张名单、号码、推送）。
- 还没做：P4 及以后，包括推演树、拼接语音、Admin 对话，以及午夜清空和 Samaritan。
- 威胁只看两件事：手里的武器、摔倒。打架、尾随这类动作判断需要姿态模型，还没做。
- 武器检测有漏检：刀挥得快、画面糊的时候认不出；侧对镜头的刀也比正对的难认。
- 识别只靠人脸。背对镜头的人有框，但认不出是谁；已经认出的人转过身，在同一个摄像头里会保持身份。

## 致谢

**深深感谢《疑犯追踪》（Person of Interest）。** 感谢 Jonathan Nolan、Greg Plageman、J.J. Abrams 和所有编剧、演员、幕后人员。谢谢 Finch 和 Reese，Root 和 Shaw，Fusco、Carter，还有 Bear——也谢谢 The Machine。我们真的太爱这部剧了。这里的每一个方框、每一个标签，都是一帧一帧对着剧重做出来的。

这是非官方的粉丝项目，和 CBS、Warner Bros. Television、Kilter Films、Bad Robot 没有关系。剧名和剧中一切归原权利人所有，仓库里不含任何剧集画面。

其他用到的东西：
- 地图：© [OpenStreetMap](https://www.openstreetmap.org/copyright) 贡献者，ODbL
- 素材：[Mixkit](https://mixkit.co)（Mixkit Stock Video Free License），运行时下载，不放进仓库
- 模型：OpenCV model zoo 的 YuNet（MIT）、SFace（Apache-2.0）、YOLOX（Apache-2.0）；Google OWLv2（Apache-2.0）
- 字体：VT323、Share Tech Mono（SIL OFL 1.1）
- 代码：MIT，见 `LICENSE`
