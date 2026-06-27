# Transcricao de gravacoes de chamadas (Whisper local)

Worker launchd que transcreve, no Mac, as gravacoes de chamadas carregadas na
ficha de cada consultor do CRM e dispara a analise comercial por Claude.

Fluxo: upload no CRM -> Supabase Storage (bucket privado `Gravacoes`) -> este
worker (cada 3 min) descarrega, transcreve com Whisper LOCAL, devolve o texto ao
CRM, e o backend corre a analise comercial (Claude) automaticamente.

## Setup (uma so vez)

### 1. Instalar o motor de transcricao

Opcao A — whisper.cpp (recomendada, rapida em Apple Silicon):
```
brew install whisper-cpp ffmpeg
# descarregar um modelo (large-v3 = melhor; medium = mais leve)
mkdir -p ~/whisper-models
curl -L -o ~/whisper-models/ggml-large-v3.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin
```
Depois descomenta `WHISPER_MODEL` no plist (passo 3) com esse caminho.

Opcao B — whisper python (fallback simples, mais lento):
```
brew install ffmpeg
pip3 install -U openai-whisper
which whisper    # confirma o caminho; se nao estiver no PATH do plist, define WHISPER_PY
```
Nao precisa de `WHISPER_MODEL`; usa `WHISPER_PY_MODEL` (default: medium, auto-descarregado).

### 2. Copiar worker para a pasta de execucao do launchd
```
cp "/Users/alexandremendes/Desktop/Claude Code/Somnium Properties/SomniumProperties-Dashboard/scripts/transcrever-gravacoes.mjs" \
   "/Users/alexandremendes/Desktop/Somnium Properties/"
```

### 3. Instalar e arrancar o agente
```
cp "/Users/alexandremendes/Desktop/Claude Code/Somnium Properties/SomniumProperties-Dashboard/scripts/com.somnium.transcrever-gravacoes.plist" \
   ~/Library/LaunchAgents/
# (edita o plist se usaste a Opcao A: descomenta WHISPER_MODEL)
launchctl unload ~/Library/LaunchAgents/com.somnium.transcrever-gravacoes.plist 2>/dev/null
launchctl load   ~/Library/LaunchAgents/com.somnium.transcrever-gravacoes.plist
```

### 4. Testar
- Carrega um audio na ficha de um consultor (separador "Gravacoes").
- Em ~3 min o estado passa a "Transcrito" e depois "Analisado".
- Logs: `~/Desktop/Somnium Properties/transcrever-gravacoes-stdout.log` e `-stderr.log`.
- Para correr ja (sem esperar pelo intervalo):
  `launchctl start com.somnium.transcrever-gravacoes`

## Variaveis de ambiente (no plist)

| Var | Default | Para que serve |
|---|---|---|
| `SOMNIUM_API_BASE` | functions do projecto | Base das Edge Functions |
| `WHISPER_MODEL` | (vazio) | Caminho do modelo ggml -> activa whisper.cpp |
| `WHISPER_BIN` | `whisper-cli` | Binario whisper.cpp |
| `WHISPER_PY` | `whisper` | Binario whisper python (fallback) |
| `WHISPER_PY_MODEL` | `medium` | Modelo do whisper python |
| `FFMPEG_BIN`/`FFPROBE_BIN` | `ffmpeg`/`ffprobe` | Conversao/duracao |

O `crm` corre com `verify_jwt = false`, por isso o worker nao precisa de chave.

## Re-tentar uma gravacao em erro
No CRM, a gravacao em estado "Erro" tem botao "Tentar de novo" (repoe para pendente).
