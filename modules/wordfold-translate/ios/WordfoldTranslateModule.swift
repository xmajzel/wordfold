import ExpoModulesCore
import MLKitTranslate

public class WordfoldTranslateModule: Module {
  public func definition() -> ModuleDefinition {
    Name("WordfoldTranslate")

    AsyncFunction("translate") { (text: String, sourceCode: String, targetCode: String, promise: Promise) in
      guard let sourceLanguage = self.language(for: sourceCode),
            let targetLanguage = self.language(for: targetCode) else {
        promise.reject("E_LANGUAGE", "Unsupported translation language pair")
        return
      }

      let options = TranslatorOptions(sourceLanguage: sourceLanguage, targetLanguage: targetLanguage)
      let translator = Translator.translator(options: options)
      let conditions = ModelDownloadConditions(allowsCellularAccess: false, allowsBackgroundDownloading: true)
      translator.downloadModelIfNeeded(with: conditions) { error in
        if let error {
          promise.reject("E_MODEL_DOWNLOAD", error.localizedDescription, error)
          return
        }
        translator.translate(text) { translatedText, error in
          if let error {
            promise.reject("E_TRANSLATION", error.localizedDescription, error)
          } else if let translatedText {
            promise.resolve(translatedText)
          } else {
            promise.reject("E_TRANSLATION", "Translation returned no text")
          }
        }
      }
    }
  }

  private func language(for code: String) -> TranslateLanguage? {
    switch code {
    case "en": return .english
    case "sk": return .slovak
    default: return nil
    }
  }
}
