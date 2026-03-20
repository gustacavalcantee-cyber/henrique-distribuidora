const { execSync } = require('child_process')
const { join } = require('path')

exports.default = async function(context) {
  const appOutDir = context.appOutDir

  // Strip quarantine xattrs
  console.log(`[afterPack] Stripping xattrs from: ${appOutDir}`)
  try {
    execSync(`xattr -cr "${appOutDir}"`, { stdio: 'inherit' })
    console.log('[afterPack] xattrs stripped successfully')
  } catch (e) {
    console.warn('[afterPack] xattr warning (non-fatal):', e.message)
  }

  // Ad-hoc sign on macOS so ShipIt (Squirrel.Mac) passes signature validation
  // Required for auto-update to work without an Apple Developer ID certificate
  if (process.platform === 'darwin') {
    const productName = context.packager.appInfo.productName
    const appPath = join(appOutDir, `${productName}.app`)
    console.log(`[afterPack] Ad-hoc signing: ${appPath}`)
    try {
      execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: 'inherit' })
      console.log('[afterPack] Ad-hoc signing done')
    } catch (e) {
      console.warn('[afterPack] codesign warning (non-fatal):', e.message)
    }
  }
}
