Pod::Spec.new do |s|
  s.name           = 'WordfoldTranslate'
  s.version        = '1.0.0'
  s.summary        = 'On-device English to Slovak translation for Wordfold'
  s.description    = 'A narrow Expo bridge over Google ML Kit Translate.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'GoogleMLKit/Translate', '8.0.0'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
