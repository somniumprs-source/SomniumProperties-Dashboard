/**
 * Comando de voz — grava voz, transcreve, cria tarefa.
 * Web Speech API (gratuito) + interpretação local no servidor.
 * Vive no rodapé da barra lateral (não flutua sobre kanban, tabelas ou toasts);
 * o painel abre ao lado da barra.
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, MicOff, Loader2, Check, X } from 'lucide-react'
import { apiFetch } from '../../lib/api.js'
import { dialogVariants } from '../../lib/motion.js'

const SpeechRecognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)

export function VoiceButton({ className = '' }) {
  const [recording, setRecording] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [result, setResult] = useState(null)
  const [showPanel, setShowPanel] = useState(false)
  const recognitionRef = useRef(null)
  const transcriptRef = useRef('')

  const processTranscript = useCallback(async (text) => {
    if (!text.trim()) return
    setProcessing(true)
    try {
      const r = await apiFetch('/api/voice/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim() }),
      })
      const data = await r.json()
      setResult({ ok: data.ok, message: data.message || data.error || 'Processado' })
    } catch {
      setResult({ ok: false, message: 'Erro de ligação ao servidor' })
    }
    setProcessing(false)
  }, [])

  // Pára a gravação se o componente sair do ecrã
  useEffect(() => () => { try { recognitionRef.current?.stop() } catch {} }, [])

  if (!SpeechRecognition) return null

  function startRecording() {
    const recognition = new SpeechRecognition()
    recognition.lang = 'pt-PT'
    recognition.continuous = true
    recognition.interimResults = true
    transcriptRef.current = ''

    recognition.onresult = (event) => {
      let final = ''
      let interim = ''
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript + ' '
        } else {
          interim += event.results[i][0].transcript
        }
      }
      transcriptRef.current = final
      setTranscript(final + interim)
    }

    recognition.onerror = () => setRecording(false)

    recognition.onend = () => {
      setRecording(false)
      const finalText = transcriptRef.current.trim()
      if (finalText) {
        processTranscript(finalText)
      } else {
        setResult({ ok: false, message: 'Não consegui ouvir. Tenta novamente.' })
      }
    }

    recognitionRef.current = recognition
    recognition.start()
    setRecording(true)
    setTranscript('')
    setResult(null)
    setShowPanel(true)
  }

  function stopRecording() {
    if (recognitionRef.current) recognitionRef.current.stop()
  }

  function close() {
    if (recognitionRef.current) { try { recognitionRef.current.stop() } catch {} }
    setShowPanel(false)
    setTranscript('')
    setResult(null)
    setRecording(false)
  }

  return (
    <>
      <button
        onClick={recording ? stopRecording : startRecording}
        className={`relative ${className} ${recording ? '!text-danger' : ''}`}
        title={recording ? 'Parar gravação' : 'Comando de voz'}
        aria-label={recording ? 'Parar gravação' : 'Comando de voz'}
        aria-pressed={recording}
      >
        {recording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        {recording && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-danger animate-pulse" />}
      </button>

      <AnimatePresence>
        {showPanel && (
          <motion.div variants={dialogVariants} initial="initial" animate="animate" exit="exit" role="dialog" aria-label="Comando de voz"
            className="fixed z-50 bottom-16 left-3 md:left-[236px] w-[min(20rem,calc(100vw-1.5rem))] bg-surface-raised text-ink rounded-xl shadow-lg border border-line overflow-hidden">
            <div className="px-4 py-2.5 border-b border-line flex items-center justify-between">
              <span className="text-ui font-medium" aria-live="polite">
                {recording ? 'A ouvir…' : processing ? 'A processar…' : 'Comando de voz'}
              </span>
              <button onClick={close} className="text-ink-muted hover:text-ink transition-colors duration-fast" aria-label="Fechar"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 space-y-3">
              {transcript && (
                <div>
                  <p className="text-overline uppercase text-ink-muted mb-1">Transcrição</p>
                  <p className="text-ui bg-surface-muted rounded-lg p-2.5">{transcript}</p>
                </div>
              )}
              {recording && (
                <div className="flex items-center gap-2 text-danger">
                  <span className="w-2 h-2 rounded-full bg-danger animate-pulse shrink-0" />
                  <span className="text-ui">A gravar. Fala agora e carrega no microfone quando acabares.</span>
                </div>
              )}
              {processing && (
                <div className="flex items-center gap-2 text-ink-muted">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-ui">A criar tarefa…</span>
                </div>
              )}
              {result && (
                <div className={`flex items-start gap-2 ${result.ok ? 'text-success' : 'text-danger'}`} role="status">
                  {result.ok ? <Check className="w-4 h-4 mt-0.5 shrink-0" /> : <X className="w-4 h-4 mt-0.5 shrink-0" />}
                  <span className="text-ui">{result.message}</span>
                </div>
              )}
              {result && (
                <button onClick={close} className="w-full py-1.5 text-caption text-ink-muted hover:text-ink transition-colors duration-fast">
                  Fechar
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
