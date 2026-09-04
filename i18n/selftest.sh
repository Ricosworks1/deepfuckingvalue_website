#!/usr/bin/env bash
# Prove the audit can fail.
#
# A check that never fires is worse than no check: it reads as coverage and
# provides none. This breaks the site on purpose, once per class of bug we have
# actually hit, and asserts that check.py notices. Every mutation is reverted
# with `git checkout` immediately afterwards.
#
# Run from the repo root:  bash i18n/selftest.sh
set -uo pipefail
cd "$(dirname "$0")/.."

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Working tree is dirty. Commit or stash first — this script runs git checkout."
  exit 1
fi

PY="${PYTHON:-python3}"
fails=0

mutate() {
  local desc="$1" code="$2"
  $PY -c "$code" || { echo "  ERROR   could not apply: $desc"; fails=$((fails+1)); return; }
  local n
  n=$($PY i18n/check.py 2>&1 | grep -c "FAIL")
  if [ "$n" -gt 0 ]; then
    echo "  caught   $desc"
  else
    echo "  MISSED   $desc   <-- check.py did not notice this"
    fails=$((fails+1))
  fi
  git checkout -q -- .
}

echo "Mutation testing the audit"

mutate "language bar removed from a page" \
  "import re;p='fr/index.html';s=open(p,encoding='utf-8').read();open(p,'w',encoding='utf-8').write(re.sub(r'<div class=\"langbar\">.*?</div>','',s,flags=re.S))"

mutate "a digit changed inside a large on-chain figure" \
  "import json;p='i18n/catalogue.fr.json';c=json.load(open(p,encoding='utf-8'));k=[k for k,v in c.items() if '117' in v and len(v)>60];c[k[0]]=c[k[0]].replace('117','118',1);json.dump(c,open(p,'w',encoding='utf-8'),ensure_ascii=False,indent=1)"

mutate "an <option value> translated (kills the meme controls silently)" \
  "p='de/memes/index.html';s=open(p,encoding='utf-8').read();open(p,'w',encoding='utf-8').write(s.replace('value=\"impact\"','value=\"wirkung\"',1))"

mutate "an internal link pointed at a page that does not exist" \
  "p='es/index.html';s=open(p,encoding='utf-8').read();open(p,'w',encoding='utf-8').write(s.replace('href=\"/es/claim/\"','href=\"/es/claim-typo/\"',1))"

mutate "meta charset removed" \
  "p='vi/dao/index.html';s=open(p,encoding='utf-8').read();open(p,'w',encoding='utf-8').write(s.replace('<meta charset=\"utf-8\">','',1))"

mutate "a CSP rule dropped for one language path" \
  "p='_headers';s=open(p).read();open(p,'w').write(s.replace('/zh/claim/*','/zh/claim-removed/*',1))"

mutate "a placeholder dropped from a translation" \
  "import json,re;p='i18n/catalogue.de.json';c=json.load(open(p,encoding='utf-8'));k=[k for k,v in c.items() if '<0>' in v and '</0>' in v][0];c[k]=c[k].replace('<0>','',1).replace('</0>','',1);json.dump(c,open(p,'w',encoding='utf-8'),ensure_ascii=False,indent=1)"

mutate "a script hardcoding display text over translated markup" \
  "p='assets/countdown.js';s=open(p,encoding='utf-8').read();open(p,'w',encoding='utf-8').write(s.replace(\"t('tOpen', 'Vesting claims are open')\",\"'Vesting claims are open'\",1))"

mutate "a script formatting numbers as en-US regardless of page language" \
  "p='assets/countdown.js';s=open(p,encoding='utf-8').read();open(p,'w',encoding='utf-8').write(s.replace('unlocked.toLocaleString(locale,','unlocked.toLocaleString(\'en-US\',',1))"

echo
if [ "$fails" -eq 0 ]; then
  echo "All mutations were caught. The audit can fail."
else
  echo "$fails mutation(s) went unnoticed. The audit has a blind spot."
fi
git checkout -q -- .
exit "$fails"
