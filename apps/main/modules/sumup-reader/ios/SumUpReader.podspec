Pod::Spec.new do |s|
  s.name = 'SumUpReader'
  s.version = '0.1.0'
  s.summary = 'WCPOS SumUp card reader bridge'
  s.description = 'Expo local module for SumUp reader checkout.'
  s.author = 'WCPOS'
  s.homepage = 'https://wcpos.com'
  s.license = { :type => 'MIT' }
  s.source = { :git => 'https://github.com/wcpos/monorepo.git' }
  s.platform = :ios, '16.0'
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.dependency 'SumUpSDK', '~> 7.1.0'
  s.source_files = '**/*.swift'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
