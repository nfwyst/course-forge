# TTS providers

`scripts/synthesize-audio.sh` reads `audio-segments.json` and delegates each segment to a provider in this directory. A provider must define:

```bash
tts_synthesize <text> <output-mp3> [voice]
```

It may also define `tts_check` and `tts_install_help`; the runner invokes them before synthesis.

## Run the pipeline

```bash
bun run extract-narrations
bun run synthesize-audio
bun run synthesize-audio -- --force
bun run synthesize-audio -- --chapters intro example
bun run synthesize-audio -- --chapters=intro,example
PRESENTATION_TTS=minimax bun run synthesize-audio
```

`edge` is the default provider. `--provider=<name>` and `--voice=<id>` override the corresponding environment variables.

## Included providers

| Provider | Authentication | Use it when |
| --- | --- | --- |
| `edge` | None | Default local setup; natural Microsoft voices without an API key |
| `minimax` | `MINIMAX_API_KEY` | You need MiniMax speech plus word-level subtitle timestamps |
| `openai` | `OPENAI_API_KEY` | You already have an OpenAI-compatible speech endpoint |

### Edge TTS

Install Edge TTS into an isolated tool environment rather than a system Python:

```bash
uv tool install edge-tts
uv tool update-shell
edge-tts --list-voices
```

Open a new shell after `uv tool update-shell`. For a project-local virtual environment, point the provider at the exact executable instead:

```bash
export EDGE_TTS_BIN=/absolute/path/to/.venv/bin/edge-tts
export PRESENTATION_EDGE_VOICE=zh-CN-XiaoxiaoNeural
```

The default voice is `zh-CN-YunxiNeural`.

### MiniMax

```bash
export MINIMAX_API_KEY=<your-token-plan-key>
PRESENTATION_TTS=minimax bun run synthesize-audio
```

The provider builds JSON from fixed Python code with model, text, and voice passed as arguments. It uses a portable temporary directory and stores any returned word timings under `public/minimax-word-timing/<chapter>/<step>.json`.

### OpenAI

```bash
export OPENAI_API_KEY=<your-api-key>
PRESENTATION_TTS=openai bun run synthesize-audio
```

Optional environment variables: `OPENAI_BASE_URL`, `OPENAI_TTS_MODEL`, and `PRESENTATION_TTS_VOICE`.

## Add a provider

Create `scripts/tts-providers/<name>.sh` and define `tts_synthesize`. Return a nonzero status when it cannot write a playable audio file. The runner is serial, preserves existing non-empty files unless `--force` is set, and returns a nonzero status if any requested segment fails.

Run `bash scripts/synthesize-audio.sh --provider=<name>` and inspect its redacted stderr. Never enable shell xtrace: provider commands contain authorization headers.
