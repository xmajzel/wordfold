Pod::Spec.new do |s|
  s.name           = 'WordfoldPronunciation'
  s.version        = '1.0.0'
  s.summary        = 'On-device pronunciation file synthesis for Wordfold'
  s.description    = 'A narrow Expo bridge over the platform speech synthesizer.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
