Pod::Spec.new do |s|
  s.name           = 'ReceiptCrop'
  s.version        = '1.0.0'
  s.summary        = 'Finds the receipt in a camera photo and crops it straight.'
  s.description    = 'Local Expo module of the UnReceipt app (mobile/modules/receipt-crop).'
  s.author         = 'UnReceipt'
  s.homepage       = 'https://unreceipt.com'
  s.license        = { :type => 'Proprietary' }
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,swift}"
end
