using System;
using System.IO;
using System.Reflection;
using System.Threading;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public sealed class ExcelQaSession : IDisposable {
 object app,books,book; readonly List<object> refs=new List<object>();
 public readonly List<Dictionary<string,object>> Events=new List<Dictionary<string,object>>();
 public int Pid; public string Version; public static int LastOwnedPid; bool owned;
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
 static Exception Root(Exception e){while(e is TargetInvocationException && e.InnerException!=null)e=e.InnerException;return e;}
 void Event(string op,string result,Exception e=null){var d=new Dictionary<string,object>{{"utc",DateTime.UtcNow.ToString("o")},{"operation",op},{"result",result}};if(e!=null){e=Root(e);d["type"]=e.GetType().FullName;d["hresult"]="0x"+e.HResult.ToString("X8");d["message"]=e.Message;}Events.Add(d);}
 object Dispatch(object target,string name,BindingFlags kind,object[] args=null){
  if(target==null)throw new InvalidOperationException("COM_TARGET_NULL_BEFORE_"+name);
  var until=DateTime.UtcNow.AddSeconds(12);
  for(;;){try{return target.GetType().InvokeMember(name,kind,null,target,args);}catch(Exception error){var e=Root(error);Event(name,"error",e);if((e.HResult!=unchecked((int)0x80010001)&&e.HResult!=unchecked((int)0x8001010A))||DateTime.UtcNow>=until)throw e;Thread.Sleep(250);}}
 }
 object Keep(object o){if(o!=null && Marshal.IsComObject(o))refs.Add(o);return o;}
 object Get(object target,string name,params object[] args){return Keep(Dispatch(target,name,BindingFlags.GetProperty,args.Length==0?null:args));}
 void Set(object target,string name,object value){Dispatch(target,name,BindingFlags.SetProperty,new[]{value});}
 object Call(object target,string name,params object[] args){return Keep(Dispatch(target,name,BindingFlags.InvokeMethod,args.Length==0?null:args));}
 public ExcelQaSession(int[] existing){
  LastOwnedPid=0;
  try{
   app=Keep(Activator.CreateInstance(Type.GetTypeFromProgID("Excel.Application",true)));
   uint pid;GetWindowThreadProcessId(new IntPtr(Convert.ToInt64(Get(app,"Hwnd"))),out pid);Pid=(int)pid;
   if(Pid<=0 || Array.IndexOf(existing??new int[0],Pid)>=0)throw new InvalidOperationException("INSTANCE_NOT_PRIVATE_NO_USER_ACCESS");owned=true;LastOwnedPid=Pid;
   var until=DateTime.UtcNow.AddSeconds(20);
   for(;;){books=Get(app,"Workbooks");if(books!=null && Convert.ToBoolean(Get(app,"Ready")))break;if(DateTime.UtcNow>=until)throw new InvalidOperationException("EXCEL_WORKBOOKS_READY_TIMEOUT");Event("Workbooks","not_ready");Thread.Sleep(250);}
   if(Convert.ToInt32(Get(books,"Count"))!=0)throw new InvalidOperationException("INSTANCE_NOT_EMPTY_NO_USER_BOOK_ACCESS");
   Set(app,"Visible",false);Set(app,"DisplayAlerts",false);Set(app,"EnableEvents",false);Set(app,"AskToUpdateLinks",false);Set(app,"AutomationSecurity",3);
   Version=Convert.ToString(Get(app,"Version"));Event("Workbooks","ready_non_null_private");
  }catch{Dispose();throw;}
 }
 public void Open(string path){
  if(!File.Exists(path))throw new FileNotFoundException("QA_COPY_NOT_FOUND",path);
  if(book!=null)throw new InvalidOperationException("BOOK_ALREADY_OPEN");
  if(books==null)throw new InvalidOperationException("WORKBOOKS_REFERENCE_NULL");
  book=Call(books,"Open",Path.GetFullPath(path),0,true,Type.Missing,Type.Missing,Type.Missing,true,Type.Missing,Type.Missing,false,false,Type.Missing,false,false,0);
  if(book==null){if(Convert.ToInt32(Get(books,"Count"))==1)book=Get(books,"Item",1);}
  if(book==null||!String.Equals(Convert.ToString(Get(book,"FullName")),Path.GetFullPath(path),StringComparison.OrdinalIgnoreCase))throw new InvalidOperationException("OPENED_BOOK_SCOPE_INVALID");
  var pv=Get(app,"ProtectedViewWindows");if(Convert.ToInt32(Get(pv,"Count"))!=0)throw new InvalidOperationException("PROTECTED_VIEW_STOP_NO_BYPASS");
  Set(app,"Calculation",-4105);Call(app,"CalculateFullRebuild");
  Event("Workbooks.Open","success");
 }
 object Sheet(string name){return Get(Get(book,"Worksheets"),"Item",name);}
 object Range(string address){return Get(Sheet("Conteo físico"),"Range",address);}
 public object Cell(string address){return Get(Range(address),"Value2");}
 public string Formula(string address){return Convert.ToString(Get(Range(address),"Formula"));}
 public bool Locked(string address){return Convert.ToBoolean(Get(Range(address),"Locked"));}
 public bool Protected(){return Convert.ToBoolean(Get(Sheet("Conteo físico"),"ProtectContents"));}
 public string Format(string address){return Convert.ToString(Get(Range(address),"NumberFormat"));}
 public int Color(string address,bool rule){object r=Range(address);if(rule)r=Call(Get(r,"FormatConditions"),"Item",1);return Convert.ToInt32(Get(Get(r,"Interior"),"Color"));}
 public int Columns(){return Convert.ToInt32(Get(Get(Get(Sheet("Conteo físico"),"UsedRange"),"Columns"),"Count"));}
 public int Rows(){return Convert.ToInt32(Get(Get(Get(Sheet("Conteo físico"),"UsedRange"),"Rows"),"Count"));}
 public string Info(){return Convert.ToString(Get(Get(Sheet("Información"),"Range","B1"),"Value2"));}
 public void SaveCopy(string path){Call(book,"SaveCopyAs",Path.GetFullPath(path));Event("SaveCopyAs","success");}
 public void Close(){if(book!=null){Call(book,"Close",false);book=null;Event("Workbook.Close","success");}}
 public void Dispose(){
  try{if(owned)Close();}catch(Exception e){Event("Close_cleanup","failed",e);}
  if(app!=null && owned){try{Call(app,"Quit");Event("Excel.Quit","success");}catch(Exception e){Event("Quit_cleanup","failed",e);}}
  for(int i=refs.Count-1;i>=0;i--){try{if(Marshal.IsComObject(refs[i]))Marshal.FinalReleaseComObject(refs[i]);}catch{}}refs.Clear();books=null;book=null;app=null;
 }
}
