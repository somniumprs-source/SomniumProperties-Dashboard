/**
 * Botão flutuante de áudio — grava voz, transcreve, cria tarefa.
 * Web Speech API (gratuito) + interpretação local no servidor.
 */
import { useState, useRef, useCallback } from 'react'
import { Mic, MicOff, Loader2, Check, X } from 'lucide-react'
import { apiFetch } from '../../lib/api.js'

const SpeechRecognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)

export function VoiceButton() {
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
        className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all ${
          recording ? 'bg-red-500 hover:bg-red-600 animate-pulse' : 'bg-indigo-600 hover:bg-indigo-700'
        }`}
        title={recording ? 'Parar gravação' : 'Gravar comando de voz'}
      >
        {recording ? <MicOff className="w-6 h-6 text-white" /> : <Mic className="w-6 h-6 text-white" />}
      </button>

      {showPanel && (
        <div className="fixed bottom-24 right-6 z-50 w-80 bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">
              {recording ? 'A ouvir...' : processing ? 'A processar...' : 'Comando de voz'}
            </span>
            <button onClick={close} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
          </div>
          <div className="p-4 space-y-3">
            {transcript && (
              <div>
                <p className="text-xs text-gray-400 mb-1">Transcrição:</p>
                <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-2.5">{transcript}</p>
              </div>
            )}

            {recording && (
              <div className="flex items-center gap-2 text-red-500">
                <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                <span className="text-sm">A gravar — fala agora e clica no microfone quando acabares</span>
              </div>
            )}

            {processing && (
              <div className="flex items-center gap-2 text-indigo-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">A criar tarefa...</span>
              </div>
            )}

            {result && (
              <div className={`flex items-start gap-2 ${result.ok ? 'text-green-600' : 'text-red-600'}`}>
                {result.ok ? <Check className="w-4 h-4 mt-0.5 shrink-0" /> : <X className="w-4 h-4 mt-0.5 shrink-0" />}
                <span className="text-sm">{result.message}</span>
              </div>
            )}

            {result && (
              <button onClick={close} className="w-full py-2 text-xs text-gray-500 hover:text-gray-700 transition-colors">
                Fechar
              </button>
            )}
          </div>
        </div>
      )}
    </>
  )
}
