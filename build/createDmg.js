const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'))
const version = pkg.version
const name = pkg.build?.productName || pkg.name

const distDir = path.join(__dirname, '../dist')
const appDir = path.join(distDir, 'mac-arm64')
const outDmg = path.join(distDir, `henrique-distribuidora-${version}-arm64.dmg`)
const volName = `${name} ${version}-arm64`

console.log(`[createDmg] Creating arm64 DMG from: ${appDir}`)
console.log(`[createDmg] Output: ${outDmg}`)

try {
  if (fs.existsSync(outDmg)) fs.unlinkSync(outDmg)

  execSync(
    `hdiutil create -volname "${volName}" -srcfolder "${appDir}" -ov -format UDZO "${outDmg}"`,
    { stdio: 'inherit' }
  )

  // Verify the binary is present
  const binaryPath = path.join(
    appDir,
    'Henrique Vendas.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework'
  )
  const dmgSize = fs.statSync(outDmg).size
  const binarySize = fs.statSync(binaryPath).size

  console.log(`[createDmg] ✓ DMG created: ${(dmgSize / 1e9).toFixed(2)}GB`)
  console.log(`[createDmg] ✓ Electron Framework binary: ${(binarySize / 1e6).toFixed(0)}MB`)
} catch (e) {
  console.error('[createDmg] Error:', e.message)
  process.exit(1)
}
