# 音频合成与字幕

每个章节的 `narrations.ts` 是口播文字和 step 数的唯一来源。流程按 step
生成 `public/audio/<chapter-id>/<step>.mp3`，再生成
`public/subtitle-timing.json`。运行时 Auto 模式会按音频 `ended` 推进；缺音频时
才按文字长度估时，便于未合成音频的预览。

## 标准流程

```bash
cd presentation
bun install --frozen-lockfile
bun run extract-narrations
bun run synthesize-audio
bun run subtitle-timing
```

`extract-narrations` 生成 `audio-segments.json`。先检查文本与 chapter ID，再进行
需要网络和费用的 TTS 合成。

## Provider

| Provider | 默认 | 鉴权 | 场景 |
| --- | :---: | --- | --- |
| `edge` | 是 | 无 | 零 key 的本地开发和中文预览 |
| `minimax` | 否 | `MINIMAX_API_KEY` | MiniMax 音质和逐词字幕 |
| `openai` | 否 | `OPENAI_API_KEY` | 现有 OpenAI 兼容端点 |

切换 provider：

```bash
PRESENTATION_TTS=minimax bun run synthesize-audio
PRESENTATION_TTS=openai bun run synthesize-audio -- --voice=nova
```

### Edge（默认）

隔离安装，避免更改系统 Python：

```bash
uv tool install edge-tts
uv tool update-shell
edge-tts --list-voices
```

重开 shell 后再运行合成。若 edge-tts 安装在项目虚拟环境中，显式传入其路径：

```bash
export EDGE_TTS_BIN=/absolute/path/to/.venv/bin/edge-tts
```

默认声线是 `zh-CN-YunxiNeural`；用
`PRESENTATION_EDGE_VOICE=zh-CN-XiaoxiaoNeural` 覆盖。

### MiniMax

```bash
export MINIMAX_API_KEY=<your-token-plan-key>
PRESENTATION_TTS=minimax bun run synthesize-audio
```

MiniMax provider 以固定 Python 代码从 argv 构建请求，并使用环境变量中的 key；
不会把文本、model、voice 或输出路径插入 Python 源码。返回的逐词时序写入
`public/minimax-word-timing/<chapter>/<step>.json`。

### 只合成改动章节

`--chapters` 支持空格或逗号分隔，且只处理指定章节：

```bash
bun run synthesize-audio -- --chapters intro practice
bun run synthesize-audio -- --chapters=intro,practice
```

已存在的非空 mp3 会跳过；传 `--force` 才重新合成。

## 字幕时序

```bash
bun run subtitle-timing
bun run subtitle-timing -- --chapters intro practice
bun run subtitle-timing -- --strict-minimax --chapters intro
bun run subtitle-timing -- --mode default
```

默认是 MiniMax 优先：每个有逐词文件的 step 用精确时序；**每个缺失或无效的
step 独立回退**到默认按字数分配，不会因为同章另一 step 有数据而漏字幕。
`--strict-minimax` 才会在任一请求 step 缺逐词数据时失败。`--mode default`
强制全部使用 `ffprobe` 实测音频长度；没有本地音频时以文字长度估时。

| 模式 | 行为 |
| --- | --- |
| 默认 / `--mode minimax` | MiniMax 逐词数据优先，缺失 step 自动回退 |
| `--strict-minimax` | 任一请求 step 缺逐词数据即失败 |
| `--mode default` | 始终使用句界和音频长度/文字长度 |

## 故障排查

| 现象 | 处理 |
| --- | --- |
| `audio-segments.json not found` | 先运行 `bun run extract-narrations` |
| `edge-tts not found` | 使用上述 `uv tool install edge-tts`，或设置 `EDGE_TTS_BIN` |
| provider 缺 API key | 在当前 shell 设置对应环境变量，不能提交到仓库 |
| 单段合成失败 | 修复 provider 后重跑；已有成功 mp3 会跳过 |
| Auto 模式没有音频 | 确认 URL 是 `?auto=1`，并首次按 Space 授予浏览器播放权限 |
| 字幕无精确时序 | 默认会显示回退字幕；需要强制精确数据时加 `--strict-minimax` |

自定义 provider 的三函数契约见
[`scripts/tts-providers/README.md`](../scripts/tts-providers/README.md)。
