// Signature « ad hoc » de l'application macOS (sans certificat Apple), en tout dernier : après les
// fusibles d'Electron (electronFuses), qui modifient le binaire. electron-builder ne signe pas
// (mac.identity: null), et un binaire Apple Silicon modifié sans nouvelle signature passe pour
// « endommagé ».
const { execFileSync } = require('node:child_process')
const path = require('node:path')

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' })
}
