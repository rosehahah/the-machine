# The Machine — MPOV 界面规范（P0）

> 依据：`research/img/` 里的约 30 张剧照和 wiki 的方框符号文件，以及 fandom wiki 的 MPOV、SPOV、消息列表页面。
> 标 **【待核对】** 的项，公开资料不足以确认，需要拿片源逐帧核对。
> 本规范只描述「看起来、动起来是什么样」。界面上的文字一律用英文。

---

## 1. 两种视觉时代

| 时代 | 代表截图 | 特征 |
|---|---|---|
| **S1 监控摄像头风格** | `Machine-cam9.jpg`、`Machine-cam16.jpg` | 偏冷的蓝灰监控画面，鱼眼感。左上是摄像头编号（`PENCAM 87`），右上是时间（`14:04:51`）。字体是低分辨率等宽像素字，带 RGB 色边。人员档案用等宽字铺在画面下部的半透明黑带上（NAME / SSN / DOB / POB / ADDRESS / OCCUPATION）。方框较细，虚线也细。 |
| **S3–S5 MPOV 风格** | `POI_0502_*`、`POI_0421_*`、`POI_0303_*` | 画面经过调色（去饱和、偏冷、对比加强），有暗角、颗粒、扫描线和轻微色差。方框粗、有发光感。字体是 **Futura** 一类的几何无衬线体，全大写。标签是实色块，状态条是黑白双层。 |

**本项目默认用 S3–S5 风格做主界面，S1 风格的摄像头编号、时间和像素字保留在画面角落**（剧中 S4 的 `FAC ALPH 08 / 20:17:50` 就是这样混用的，见 `POI_0421_MPOV_Primary_Asset_Identified_-_Sameen_Shaw.png`）。

---

## 2. 方框（Box）

### 2.1 形状（来源：wiki 的 `S03-*.svg`，对照 `sheet.png`）
- 近似正方形，**框的是头肩**，不是全身：上沿在头顶上方一点，下沿在下巴到领口之间（见 Finch ADMIN 截图，脸宽约占框宽的 55–60%）。
- 四边是**虚线**：线宽约为框边长的 1/100–1/80，划线长约 3%，间隙约 2%。
- 四角是**实线 L 形角标**，比虚线粗约 1.6 倍，每条臂长约为边长的 10%，转角略圆。
- 四边中点各有一个**短刻度**，垂直于边、朝框内伸出，长度约为边长的 5%。
- 背过身的人同样有框，框在后脑勺位置（`POI_0502_MPOV_Threats_Identified.png`）。
- 远处的人用小框，线宽不按比例缩小，有一个最小线宽。

### 2.2 颜色与含义

| 方框 | 颜色值（取样） | 含义 | 来源 |
|---|---|---|---|
| 白色虚线 | `#F2F2F2` | 普通人，无威胁，或属于「无关」名单 | wiki、截图 |
| 白框红角 | 白 + `#E8212B` | 对「号码」构成威胁的人 **【待核对】** | wiki 符号 |
| 红色虚线 | `#E8212B` | 被判定为威胁 | wiki、`Threats_Identified` |
| 黄色虚线 | `#F2E02A` | 知道 The Machine 存在的人：ADMIN（Finch）、PRIMARY ASSET（Reese）等 | wiki、Finch / Reese 截图 |
| 黑框黄角 | 黑 + `#F2E02A` | ANALOG INTERFACE（Root） | wiki 符号 **【待核对：出现的季数】** |
| 蓝色虚线 | `#1D6CF0` | 政府人员（ISA） | wiki |
| 蓝框白角 | 蓝 + 白 | S5 出现 **【待核对：含义】** | wiki 符号 |

P1–P2 只用到 **白、黄、黑框黄角** 三种。红、蓝留给 P3 的威胁引擎。

### 2.3 方框动效
- **锁定**：新目标出现时，框从约 1.5 倍大小、透明，在约 0.25 秒内缩到目标位置，同时闪一下高亮。
- **变色**：身份确认时不是渐变，而是**新旧颜色交替闪烁 3–4 次**（约 0.4 秒），停在新颜色上（`Squares_changing_colour.jpg` 是同一人从白变黄、黄变红的前后对比）。
- **跟随**：框跟着人平滑移动，没有明显延迟和抖动。
- **丢失**：目标离开画面后，框原地淡出（约 0.3 秒）。

---

## 3. 标签（Label）

- 位置：方框**右侧**，留小间隙，竖直方向大约对齐框的上 1/3 处（`ADMIN` 截图）。若右侧放不下就放左侧。
- 样式：**实色矩形**，填充色等于方框色，没有圆角，内边距约为字高的 0.5 倍。
- 文字：Futura Medium/Demi，全大写，略加字距。黄、白底上用深色字（`#111`），红、蓝底上用白字。
- 已知文案：`ADMIN`、`THREAT`、`PRIMARY ASSET`、`SECONDARY ASSET`、`ANALOG INTERFACE`、`IRRELEVANT`、`RELEVANT`。

---

## 4. 状态条（Status bar）

`THREATS IDENTIFIED / PROCESSING…`、`CONTEXTUALIZING…`、`COMPILING PERSONAL PROFILES.` 这几张截图里的状态条结构一致：
- 位置：画面**下 1/3 处、水平居中**。
- 外框：约 2px 的白色描边，圆角很小（约 4px），有一点外发光。
- **双层**：上层黑底，彩色粗体大字（威胁用红，普通用白）；下层白底，黑色小字（`PROCESSING…`）。
- 也有**单层**样式：黑底白字，如 `CONTEXTUALIZING…`。
- 省略号逐个出现，或者一直闪。

---

## 5. 人员档案卡（Dossier）

来源：`POI_0502_Reese_Primary_Asset_Identified.png`、`..._Sameen_Shaw.png`、`..._Denton_Weeks.png`。
- 黑色半透明面板，外面一圈浅灰细描边。
- **头部**：黑底，黄色（身份相关）或白色粗体标题，如 `PRIMARY ASSET IDENTIFIED`。
- **副标题条**：浅灰底、深色字，如 `ALIAS: REESE, JOHN`、`SUBJECT: SHAW, SAMEEN`、`SSN: XXX-XX-6711`。
- **正文**：左列字段名，右列字段值，白色 Futura：`SSN / DOB / ADDRESS / OCCUPATION / POB / IMMEDIATE RELATIVES`。敏感值显示为 `REDACTED`。
- **底部警示**：可选的红色居中文字（如 `DIRECTLY RESPONSIBLE FOR …`）。
- 可以带证件照（Shaw 截图），也可以从方框拉一条**细白引线**连到档案卡，引线一端是小圆点。

---

## 6. 摄像头角标（S1 / S4 风格）

- 左上：摄像头编号，如 `PENCAM 87`、`FAC ALPH 08`、`SEC CAM 4`。像素等宽字，字距大。
- 右上（或编号下方）：`HH:MM:SS`，每秒刷新。
- 字色接近白，带轻微的红、青色错位（色差）。
- 本项目所用字体：VT323（开源），近似剧中的像素字。

---

## 7. 画面调色与质感

- 去饱和到约 35–50%，色温偏冷（青蓝），暗部偏蓝黑。
- 对比加强，高光略压。
- 暗角明显。
- 细颗粒噪点，每帧变化。
- 细横向扫描线，很淡。
- 轻微色差，越靠边缘越明显。
- 偶发的**故障闪烁**：切换摄像头或识别成功时，出现 1–3 帧的横向撕裂和错位。

---

## 8. 开机画面（System Startup）

来源：`POI_0122_System_Startup.png`。深蓝黑底，等宽字逐行打出：

```
- - - - - SYSTEM STARTUP - - - - -
START_KERNEL
INIT
RUNLEVEL

LAUNCHING...
CORE ANALYTICS
NEURAL NETWORKS
HEURISTIC ENGINES
RECURSION PROCESSORS
EVOLUTIONARY GENERATORS
BAYESIAN NETWORKS
DATA ACQUISITION
CRYPTOGRAPHIC ALGORITHMS
DOCUMENT PROCESSORS
COMPUTATIONAL LINGUISTICS
VOICEPRINT IDENTIFICATION
NATURAL LANGUAGE PROCESSING
FACIAL RECOGNITION
GAIT ANALYSIS
BIOMETRIC RECOGNITION
SUBJECT IDENTIFICATION
PATTERN MINING
INTEL INTERPRETATION
THREAT DETECTION
THREAT CLASSIFICATION
DISSEMINATION PROTOCOLS
CONTINUITY-OF-OPERATIONS PROTOCOLS
```

---

## 9. 文案库（P1–P2 会用到的）

- `ADMIN IDENTIFIED`、`ANALOG INTERFACE IDENTIFIED`、`PRIMARY ASSET IDENTIFIED`
- `SUBJECT ACQUIRED`、`TRACKING…`、`SUBJECT LOST`
- `ENROLLING SUBJECT` / `HOLD STILL`、`PROFILE COMPILED`
- `SWITCHING FEED…`、`FEED ACQUIRED`、`NO SIGNAL`
- 5x01 里 Machine 对 Admin 说的话：`GOOD MORNING, ADMIN.`（打字机效果，用于识别 ADMIN 后的问候）

## 10. 以后的阶段（不在 P1–P2）
- Samaritan（SPOV）：白底、红色倒三角或圆圈符号、极简黑字。wiki 的符号表已存进 `raw/Samaritan_SPOV.json`。
- 推演树（`POI_0411_*`、`POI_0303_*`）：黑底，粒子网络，黄、红轨迹线，百分比标签，如 `ASSET ESCAPE 62.96 %`。
- 号码播报：北约音标字母和单词，按 3 组 × 3 词的格式（见 `raw/List_of_the_Machine_s_Messages.json`）。
