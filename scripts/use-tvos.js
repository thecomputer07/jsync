// Le build TV usano il fork react-native-tvos; telefoni ed Expo Go il React Native standard.
// EAS esegue questo script prima di installare le dipendenze (hook "eas-build-pre-install"):
// con EXPO_TV=1 (profilo "tv") sostituisce react-native col fork della stessa versione.
const fs = require('fs');
const path = require('path');

const force = process.argv.includes('--force');
if (!force && process.env.EXPO_TV !== '1') process.exit(0);

const file = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
const rn = pkg.dependencies['react-native'];
if (rn.startsWith('npm:react-native-tvos')) process.exit(0);
pkg.dependencies['react-native'] = `npm:react-native-tvos@${rn.replace(/^[~^]/, '')}-0`;
fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n');
console.log('[tv] react-native ->', pkg.dependencies['react-native']);
