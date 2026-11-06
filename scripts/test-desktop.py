import os, subprocess, socket, sys, time
from pathlib import Path
root=str(Path(__file__).resolve().parents[1])
port=int(os.environ.get("JADEMD_PORT", "31337"))
with socket.socket() as check:
    assert check.connect_ex(("127.0.0.1", port)) != 0, "El puerto de prueba ya está ocupado"
electron = str(Path(root) / 'desktop' / 'node_modules' / 'electron' / 'dist' / ('electron.exe' if sys.platform == 'win32' else 'electron'))
smoke = str(Path(root) / 'desktop' / 'smoke.cjs')
cmd = [electron, smoke] if sys.platform == 'win32' else ['xvfb-run', '-a', electron, smoke, '--ozone-platform=x11']
for scenario in ['vaults','crash']:
    env=dict(os.environ, JADEMD_PORT=str(port), JADEMD_SMOKE_SCENARIO=scenario)
    env.pop('ELECTRON_RUN_AS_NODE', None)
    result=subprocess.run(cmd,env=env,cwd=root,timeout=45)
    assert result.returncode in ([0] if scenario != 'crash' else [1, 137, -9]), (scenario,result.returncode)
    for attempt in range(30):
        s=socket.socket(); occupied=s.connect_ex(('127.0.0.1',port))==0; s.close()
        if not occupied: break
        time.sleep(.1)
    assert not occupied, f'{scenario}: port still open'
    print(f'PASS {scenario}: port {port} released',flush=True)
