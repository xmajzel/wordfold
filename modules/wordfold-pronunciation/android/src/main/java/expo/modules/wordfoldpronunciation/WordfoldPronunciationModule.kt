package expo.modules.wordfoldpronunciation

import android.net.Uri
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.kotlin.types.OptimizedRecord
import java.io.File
import java.util.UUID

class WordfoldPronunciationModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("WordfoldPronunciation")

    AsyncFunction("synthesizeToFile") { options: PronunciationFileOptions, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("E_CONTEXT", "The Android application context is unavailable", null)
        return@AsyncFunction
      }
      if (options.text.isBlank()) {
        promise.reject("E_INPUT", "Pronunciation text cannot be empty", null)
        return@AsyncFunction
      }
      if (options.text.length > TextToSpeech.getMaxSpeechInputLength()) {
        promise.reject("E_INPUT", "Pronunciation text is too long for the device speech engine", null)
        return@AsyncFunction
      }

      val outputFile = fileForUri(options.outputUri)
      if (outputFile == null) {
        promise.reject("E_OUTPUT", "Pronunciation output must use a local file URI", null)
        return@AsyncFunction
      }
      outputFile.parentFile?.mkdirs()
      outputFile.delete()

      val utteranceId = UUID.randomUUID().toString()
      var engine: TextToSpeech? = null
      var settled = false
      fun reject(code: String, message: String, error: Throwable? = null) {
        if (settled) return
        settled = true
        outputFile.delete()
        promise.reject(code, message, error)
        engine?.shutdown()
      }
      fun resolve() {
        if (settled) return
        val size = outputFile.length()
        if (!outputFile.isFile || size <= MINIMUM_AUDIO_FILE_BYTES) {
          reject("E_EMPTY_AUDIO", "The device speech engine produced no playable audio")
          return
        }
        settled = true
        promise.resolve(size.toDouble())
        engine?.shutdown()
      }

      engine = TextToSpeech(context) { status ->
        val initializedEngine = engine
        if (status != TextToSpeech.SUCCESS || initializedEngine == null) {
          reject("E_TTS_INIT", "The device speech engine could not be initialized")
          return@TextToSpeech
        }
        val voice = try {
          initializedEngine.voices.firstOrNull { it.name == options.voiceIdentifier }
        } catch (error: Exception) {
          reject("E_VOICE", "The installed device voices could not be read", error)
          return@TextToSpeech
        }
        if (voice == null) {
          reject("E_VOICE", "The exact requested device voice is no longer installed")
          return@TextToSpeech
        }
        if (canonicalLocale(voice.locale.toLanguageTag()) != canonicalLocale(options.locale)) {
          reject("E_VOICE_LOCALE", "The requested device voice no longer matches the exact pronunciation locale")
          return@TextToSpeech
        }

        initializedEngine.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
          override fun onStart(id: String) = Unit
          override fun onDone(id: String) {
            if (id == utteranceId) resolve()
          }
          override fun onStop(id: String, interrupted: Boolean) {
            if (id == utteranceId) reject("E_TTS_STOPPED", "Pronunciation file synthesis was stopped")
          }
          override fun onError(id: String) {
            if (id == utteranceId) reject("E_TTS", "The device speech engine could not synthesize pronunciation")
          }
          override fun onError(id: String, errorCode: Int) {
            if (id == utteranceId) reject("E_TTS", "The device speech engine failed with code $errorCode")
          }
        })
        initializedEngine.voice = voice
        initializedEngine.setSpeechRate(options.rate)
        initializedEngine.setPitch(options.pitch)
        val params = Bundle().apply {
          putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 1f)
        }
        val result = initializedEngine.synthesizeToFile(options.text, params, outputFile, utteranceId)
        if (result == TextToSpeech.ERROR) {
          reject("E_TTS", "The device speech engine rejected pronunciation file synthesis")
        }
      }
    }
  }

  private fun fileForUri(uri: String): File? {
    val parsed = Uri.parse(uri)
    if (parsed.scheme != "file" || parsed.path.isNullOrBlank()) return null
    return File(parsed.path!!)
  }

  private fun canonicalLocale(locale: String) = locale.trim().replace('_', '-').lowercase()

  companion object {
    private const val MINIMUM_AUDIO_FILE_BYTES = 44L
  }
}

@OptimizedRecord
data class PronunciationFileOptions(
  @Field val text: String,
  @Field val locale: String,
  @Field val voiceIdentifier: String,
  @Field val rate: Float,
  @Field val pitch: Float,
  @Field val outputUri: String,
) : Record
