use std::{env,fs,path::{Path,PathBuf}};
use syn::{visit::{self,Visit},spanned::Spanned};
use quote::ToTokens;
use serde_json::{json,Value};
struct Graph {nodes:Vec<Value>,edges:Vec<Value>,issues:Vec<String>,file:String,owner:String}
impl Graph {
 fn symbol(&mut self,name:String,kind:&str,line:usize)->String {let id=format!("{}#{}@{}",self.file,name,line);self.nodes.push(json!({"id":id,"kind":kind,"name":name,"file":self.file,"line":line,"language":"rust"}));self.edges.push(json!({"from":self.owner,"to":id,"kind":"declares","resolution":"ast"}));id}
 fn edge(&mut self,to:String,kind:&str){self.edges.push(json!({"from":self.owner,"to":to,"kind":kind,"resolution":"syntax-only"}));}
}
impl<'ast> Visit<'ast> for Graph {
 fn visit_item_fn(&mut self,item:&'ast syn::ItemFn){let previous=self.owner.clone();self.owner=self.symbol(item.sig.ident.to_string(),"function",item.span().start().line);visit::visit_item_fn(self,item);self.owner=previous;}
 fn visit_impl_item_fn(&mut self,item:&'ast syn::ImplItemFn){let previous=self.owner.clone();self.owner=self.symbol(item.sig.ident.to_string(),"method",item.span().start().line);visit::visit_impl_item_fn(self,item);self.owner=previous;}
 fn visit_item_struct(&mut self,item:&'ast syn::ItemStruct){self.symbol(item.ident.to_string(),"struct",item.span().start().line);visit::visit_item_struct(self,item);}
 fn visit_item_enum(&mut self,item:&'ast syn::ItemEnum){self.symbol(item.ident.to_string(),"enum",item.span().start().line);visit::visit_item_enum(self,item);}
 fn visit_item_trait(&mut self,item:&'ast syn::ItemTrait){self.symbol(item.ident.to_string(),"trait",item.span().start().line);visit::visit_item_trait(self,item);}
 fn visit_item_use(&mut self,item:&'ast syn::ItemUse){self.edge(item.tree.to_token_stream().to_string(),"imports");}
 fn visit_expr_call(&mut self,item:&'ast syn::ExprCall){self.edge(item.func.to_token_stream().to_string(),"calls");visit::visit_expr_call(self,item);}
 fn visit_expr_method_call(&mut self,item:&'ast syn::ExprMethodCall){self.edge(item.method.to_string(),"calls");visit::visit_expr_method_call(self,item);}
 fn visit_macro(&mut self,item:&'ast syn::Macro){self.edge(item.path.to_token_stream().to_string(),"macro-invocation");}
}
fn walk(path:&Path,out:&mut Vec<PathBuf>){for entry in fs::read_dir(path).unwrap(){let entry=entry.unwrap();let name=entry.file_name().to_string_lossy().to_string();if name.starts_with('.')||["target","node_modules","dist","out","vendor"].contains(&name.as_str()){continue}let path=entry.path();if path.is_dir(){walk(&path,out)}else if path.extension().is_some_and(|e|e=="rs"){out.push(path)}}}
fn main(){let root=PathBuf::from(env::args().nth(1).expect("repository path"));let mut paths=vec![];walk(&root,&mut paths);let mut graph=Graph{nodes:vec![],edges:vec![],issues:vec![],file:String::new(),owner:String::new()};for path in paths{graph.file=path.strip_prefix(root.parent().unwrap()).unwrap().to_string_lossy().replace('\\',"/");graph.owner=format!("file:{}",graph.file);match syn::parse_file(&fs::read_to_string(&path).unwrap()){Ok(file)=>{graph.nodes.push(json!({"id":graph.owner,"kind":"file","name":path.file_name().unwrap().to_string_lossy(),"file":graph.file,"line":1,"language":"rust"}));graph.visit_file(&file)},Err(error)=>graph.issues.push(format!("{}: {}",graph.file,error))}}
println!("{}",json!({"nodes":graph.nodes,"edges":graph.edges,"issues":graph.issues}));}
