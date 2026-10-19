import runpy,sys
from pathlib import Path
sys.argv=[str(Path(__file__).with_name('DEPLOY_REQUIREMENT.py')),'--rollback']
runpy.run_path(sys.argv[0],run_name='__main__')
