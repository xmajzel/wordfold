package expo.modules.wordfoldtranslate

import com.google.mlkit.common.model.DownloadConditions
import com.google.mlkit.nl.translate.TranslateLanguage
import com.google.mlkit.nl.translate.Translation
import com.google.mlkit.nl.translate.TranslatorOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class WordfoldTranslateModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("WordfoldTranslate")

    AsyncFunction("translate") { text: String, sourceCode: String, targetCode: String, promise: Promise ->
      val sourceLanguage = TranslateLanguage.fromLanguageTag(sourceCode)
      val targetLanguage = TranslateLanguage.fromLanguageTag(targetCode)
      if (sourceLanguage == null || targetLanguage == null) {
        promise.reject("E_LANGUAGE", "Unsupported translation language pair", null)
        return@AsyncFunction
      }

      val options = TranslatorOptions.Builder()
        .setSourceLanguage(sourceLanguage)
        .setTargetLanguage(targetLanguage)
        .build()
      val translator = Translation.getClient(options)
      val conditions = DownloadConditions.Builder().requireWifi().build()

      translator.downloadModelIfNeeded(conditions)
        .continueWithTask { translator.translate(text) }
        .addOnSuccessListener { result ->
          promise.resolve(result)
          translator.close()
        }
        .addOnFailureListener { error ->
          promise.reject("E_TRANSLATION", error.message ?: "Translation failed", error)
          translator.close()
        }
    }
  }
}
