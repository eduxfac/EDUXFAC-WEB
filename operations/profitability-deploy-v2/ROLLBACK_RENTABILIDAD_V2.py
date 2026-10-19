from APPLY_RENTABILIDAD_V2 import *
if __name__=='__main__':
 need(sys.argv[1:]==['--apply'],'ROLLBACK_NOT_REQUESTED')
 check_scope();guard()
 state=json.loads((WORK/'BEFORE.json').read_text(encoding='utf-8'))
 manifest=json.loads((WORK/'MANIFEST.json').read_text(encoding='utf-8'))
 need(not (WORK/'ROLLBACK_DONE.json').exists(),'ROLLBACK_ALREADY_DONE_STOP')
 restore(state,manifest)
 print('RENTABILIDAD_ROLLBACK_V2_OK')
