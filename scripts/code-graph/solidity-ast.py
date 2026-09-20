"""Export source-unit ASTs, including files that declare no contracts."""
import json, os, pathlib, subprocess, sys, tomllib
root=pathlib.Path(sys.argv[1]).resolve()
config=tomllib.loads((root/'foundry.toml').read_text())['profile']['default']
version=config['solc']
paths=[os.environ.get('SOLC_BINARY',''),str(pathlib.Path.home()/f'Library/Application Support/svm/{version}/solc-{version}'),str(pathlib.Path.home()/f'.svm/{version}/solc-{version}')]
compiler=next((p for p in paths if p and pathlib.Path(p).is_file()),None)
if not compiler: raise SystemExit('Set SOLC_BINARY to the installed Solidity '+version+' binary')
sources={str(p.relative_to(root)):{'content':p.read_text()} for p in sorted((root/'src').rglob('*.sol'))}
input={'language':'Solidity','sources':sources,'settings':{'remappings':config['remappings'],'outputSelection':{'*':{'':['ast']}}}}
result=subprocess.run([compiler,'--standard-json','--base-path',str(root)],input=json.dumps(input),text=True,capture_output=True,check=True)
output=json.loads(result.stdout)
errors=[e['formattedMessage'] for e in output.get('errors',[]) if e['severity']=='error']
if errors: raise SystemExit('\n'.join(errors))
json.dump({name:value['ast'] for name,value in output['sources'].items() if name in sources},sys.stdout)
