const { execSync } = require('child_process')

exports.default = async function(context) {
  const appOutDir = context.appOutDir
  console.log(`[afterPack] Stripping xattrs from: ${appOutDir}`)
  try {
    execSync(`xattr -cr "${appOutDir}"`, { stdio: 'inherit' })
    console.log('[afterPack] xattrs stripped successfully')
  } catch (e) {
    console.warn('[afterPack] xattr warning (non-fatal):', e.message)
  }
}
