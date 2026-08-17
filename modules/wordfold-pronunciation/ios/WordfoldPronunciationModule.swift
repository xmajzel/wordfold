import AVFoundation
import ExpoModulesCore

public final class WordfoldPronunciationModule: Module {
  private var tasks: [UUID: PronunciationFileTask] = [:]

  public func definition() -> ModuleDefinition {
    Name("WordfoldPronunciation")

    AsyncFunction("synthesizeToFile") { (options: PronunciationFileOptions, promise: Promise) in
      guard !options.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
        promise.reject("E_INPUT", "Pronunciation text cannot be empty")
        return
      }
      guard let voice = AVSpeechSynthesisVoice(identifier: options.voiceIdentifier) else {
        promise.reject("E_VOICE", "The exact requested device voice is no longer installed")
        return
      }
      guard canonicalLocale(voice.language) == canonicalLocale(options.locale) else {
        promise.reject("E_VOICE_LOCALE", "The requested device voice no longer matches the exact pronunciation locale")
        return
      }
      guard let outputURL = URL(string: options.outputUri), outputURL.isFileURL else {
        promise.reject("E_OUTPUT", "Pronunciation output must use a local file URI")
        return
      }

      let id = UUID()
      let task = PronunciationFileTask(
        text: options.text,
        voice: voice,
        rate: options.rate,
        pitch: options.pitch,
        outputURL: outputURL,
        promise: promise
      ) { [weak self] in
        self?.tasks[id] = nil
      }
      tasks[id] = task
      task.start()
    }

    OnDestroy {
      let activeTasks = Array(self.tasks.values)
      self.tasks.removeAll()
      activeTasks.forEach { $0.cancel() }
    }
  }

  private func canonicalLocale(_ locale: String) -> String {
    locale.trimmingCharacters(in: .whitespacesAndNewlines)
      .replacingOccurrences(of: "_", with: "-")
      .lowercased()
  }
}

private struct PronunciationFileOptions: Record {
  @Field var text: String = ""
  @Field var locale: String = ""
  @Field var voiceIdentifier: String = ""
  @Field var rate: Double = 0.9
  @Field var pitch: Double = 1
  @Field var outputUri: String = ""
}

private final class PronunciationFileTask {
  private let synthesizer = AVSpeechSynthesizer()
  private let utterance: AVSpeechUtterance
  private let outputURL: URL
  private let promise: Promise
  private let finish: () -> Void
  private var audioFile: AVAudioFile?
  private var settled = false

  init(
    text: String,
    voice: AVSpeechSynthesisVoice,
    rate: Double,
    pitch: Double,
    outputURL: URL,
    promise: Promise,
    finish: @escaping () -> Void
  ) {
    let utterance = AVSpeechUtterance(string: text)
    utterance.voice = voice
    utterance.rate = Float(rate) * AVSpeechUtteranceDefaultSpeechRate
    utterance.pitchMultiplier = Float(pitch)
    utterance.volume = 1
    self.utterance = utterance
    self.outputURL = outputURL
    self.promise = promise
    self.finish = finish
  }

  func start() {
    do {
      try FileManager.default.createDirectory(
        at: outputURL.deletingLastPathComponent(),
        withIntermediateDirectories: true
      )
      try? FileManager.default.removeItem(at: outputURL)
    } catch {
      reject("E_OUTPUT", "The pronunciation cache directory could not be created", error)
      return
    }

    synthesizer.write(utterance) { [weak self] buffer in
      self?.receive(buffer)
    }
  }

  func cancel() {
    guard !settled else { return }
    synthesizer.stopSpeaking(at: .immediate)
    reject("E_TTS_STOPPED", "Pronunciation file synthesis was stopped")
  }

  private func receive(_ buffer: AVAudioBuffer) {
    guard !settled else { return }
    guard let pcmBuffer = buffer as? AVAudioPCMBuffer else {
      reject("E_AUDIO_BUFFER", "The device speech engine returned an unsupported audio buffer")
      return
    }
    if pcmBuffer.frameLength == 0 {
      audioFile = nil
      resolveFile()
      return
    }
    do {
      if audioFile == nil {
        audioFile = try AVAudioFile(
          forWriting: outputURL,
          settings: pcmBuffer.format.settings,
          commonFormat: pcmBuffer.format.commonFormat,
          interleaved: pcmBuffer.format.isInterleaved
        )
      }
      try audioFile?.write(from: pcmBuffer)
    } catch {
      reject("E_AUDIO_WRITE", "The synthesized pronunciation could not be written", error)
    }
  }

  private func resolveFile() {
    guard !settled else { return }
    do {
      let attributes = try FileManager.default.attributesOfItem(atPath: outputURL.path)
      let size = (attributes[.size] as? NSNumber)?.intValue ?? 0
      guard size > 44 else {
        reject("E_EMPTY_AUDIO", "The device speech engine produced no playable audio")
        return
      }
      settled = true
      promise.resolve(size)
      finish()
    } catch {
      reject("E_EMPTY_AUDIO", "The device speech engine produced no playable audio", error)
    }
  }

  private func reject(_ code: String, _ message: String, _ error: Error? = nil) {
    guard !settled else { return }
    settled = true
    audioFile = nil
    try? FileManager.default.removeItem(at: outputURL)
    let description = error.map { "\(message): \($0.localizedDescription)" } ?? message
    promise.reject(code, description)
    finish()
  }
}
