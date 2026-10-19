from pathlib import Path
import sys,runpy
sys.argv=[str(Path(__file__).with_name('DEPLOY_IMPORTER.py')),'--rollback']
runpy.run_path(sys.argv[0],run_name='__main__')
